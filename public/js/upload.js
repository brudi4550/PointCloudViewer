/*============================================================================
    submit button not visible until file is a valid *.las-file
============================================================================*/
document.getElementById("fileToUpload").addEventListener("change", function () {
    let elemtentsAfterFileChosen = document.getElementById("elemtentsAfterFileChosen");
    let inputCloudname = document.getElementById("inputCloudname");
    if (this.files.length > 0) {
        // mime type of las files not available, so it's only possible to check file type by filename
        if (!this.files[0].name.endsWith(".las")) {
            elemtentsAfterFileChosen.hidden = true;
            alert("Please choose another file: only *.las files supported.");
            return;
        }
        elemtentsAfterFileChosen.hidden = false;
        inputCloudname.value = this.files[0].name.substring(0, this.files[0].name.length - 4);
    }
    else {
        elemtentsAfterFileChosen.hidden = true;
    }
})

/*============================================================================
    listener validates and uploads the file to upload
    after the submit button is pressed
============================================================================*/
document.getElementById("uploadForm").addEventListener("submit", handleForm);
function handleForm(event) {

    // helper functions
    // ============================================================================
    function showProgressBar(boolean) {
        document.getElementById("uploadProgress").hidden = !boolean;
    }
    function showFileChooserAndSubmitButton(boolean) {
        document.getElementById("fileToUpload").hidden = !boolean;
        document.getElementById("uploadSubmitButton").hidden = !boolean;
    }
    function updateProgressStatus(part, of) {
        let progressBar = document.getElementById("progressBar");
        let progressInformation = document.getElementById("progressInformation");
        progressBar.style.backgroundSize = ((part + 1) * 100 / of) + "% 100%";
        progressInformation.innerHTML = part + 1 + " of " + of;
        if (part + 1 == of) {
            document.getElementById("uploadComplete").hidden = false;
        }
    }

    // begin of function handleForm
    //============================================================================
    event.preventDefault();

    // FIXME: Geplantes Vorgehen:
    // 1. GET http://localhost:3000/user/{user_name}/pointcloud/{cloud_name}
    // bei existierendem Eintrag Nachricht ausgeben:
    //   "Der Name dieser Punktwolke existiert bereits. Möchten Sie diese Punktwolke ersetzen?"
    //   Bei ja: weitermachen, bei nein: abbrechen oder anderen Namen eingeben
    //   Wenn bereits ein Upload im Gange ist (bei upload_status != COMPLETED), User darüber in Kenntnis setzen.
    //      unkompliziert: "warten Sie, bis der Upload abgeschlossen ist"
    //   "Der Name dieser Punktwolke existiert bereits. Bitte löschen Sie diese zuerst, oder geben Sie einen anderen Namen an."
    //   
    // 2. PUT http://localhost:3000/multipart_upload/start_upload
    //    falls files bereits bestehen am server (las, konvertiert), werden diese gelöscht,
    //    neue(r) ordner werden angelegt für den bevorstehenden upload
    /*    body = cloud_table {
            "id": 0,
            "cloud_name": 0,
            "created_by": 0,
            }                       */
    // 3. PUT http://localhost:3000/multipart_upload
    //       wie gehabt
    // 4. POST http://localhost:3000/multipart_upload/complete_upload

    let uploadForm = event.target;

    let originalFile = document.getElementById("fileToUpload").files[0];
    document.getElementById("inputCloudname").disabled = true;
    let inputCloudname = document.getElementById("inputCloudname").value;

    let getRequest = new Request("pointcloud/" + inputCloudname, {
        method: "GET",
    });
    fetch(getRequest)
        .then(getResponse => getResponse.json())
        .then(async cloud_obj => {
            if (Object.entries(cloud_obj).length != 0) {
                alert("The name of this point cloud already exists. Please delete the point cloud first or enter another name.");
                showFileChooserAndSubmitButton(true);
                showProgressBar(false);
                document.getElementById("inputCloudname").disabled = false;
                return;
            }
            showFileChooserAndSubmitButton(false);
            showProgressBar(true);

            let startRequest = new Request("multipart-upload/start-upload", {
                body: new URLSearchParams("cloud_name=" + inputCloudname),
                method: "PUT",
            });
            await fetch(startRequest)
                .then(startResponse => startResponse.json())
                .then(async startRequestData => {
                    const responseForCloudID = await fetch(new Request("pointcloud/" + inputCloudname, { method: "GET" }));
                    const responseDataForCloudID = await responseForCloudID.json();
                    const CLOUD_ID = await responseDataForCloudID.id;
                    const UPLOADURL = "multipart-upload";
                    const CHUNKSIZE = 1024 * 1024 / 2;

                    async function processChunk(part, of) {
                        if (part < of) {
                            let offset = part * CHUNKSIZE;
                            console.log("Verarbeite Part " + (part + 1).toString() + " von " + of.toString());

                            // prepare formdata
                            let formData = new FormData();
                            formData.append("id", CLOUD_ID);
                            formData.append("cloud_name", inputCloudname);
                            formData.append("part", part);
                            formData.append("fileToUpload", originalFile.slice(offset, offset + CHUNKSIZE));

                            // send chunk
                            let request = new Request(UPLOADURL, {
                                body: formData,
                                method: "PUT",
                            });
                            await fetch(request)
                                .then((response) => {
                                    if (response.status != 200) {
                                        console.error("error");
                                    }
                                    return response.json();
                                })
                                .then((data) => {
                                    updateProgressStatus(part, of);
                                    console.log("Antwort vom Server:", data);
                                })
                                .then(async () => {
                                    // after successfully sending the current chunk, process next chunk recursively
                                    await processChunk(part + 1, of);
                                })
                        }
                    }

                    // slice original file into chunks and send them one after another
                    let chunks = Math.ceil(originalFile.size / CHUNKSIZE, CHUNKSIZE);
                    let chunk = 0;
                    await processChunk(chunk, chunks)
                        // send post request for upload-completion after processing all chunks
                        .then(() => {
                            console.log("Beginne mit Abschluss des Uploads");
                            let requestForCompleting = new Request("multipart-upload/complete-upload", {
                                body: new URLSearchParams("id=" + CLOUD_ID + "&" + "cloud_name=" + inputCloudname),
                                method: "POST",
                            });
                            fetch(requestForCompleting)
                                .then((response) => {
                                    console.log(response);
                                    let requestForConverting = new Request('convertFile/' + CLOUD_ID, {
                                        method: 'PATCH',
                                    })
                                    fetch(requestForConverting)
                                        .then((response) => {
                                            console.log(response);
                                            let requestForSendingToS3 = new Request('sendToS3/' + CLOUD_ID, {
                                                method: 'PATCH'
                                            })
                                            fetch(requestForSendingToS3)
                                                .then((response) => {
                                                    console.log(response);
                                                    let requestToGenerateHTMLPage = new Request('generateHTMLPage/' + CLOUD_ID, {
                                                        method: 'PATCH'
                                                    })
                                                    fetch(requestToGenerateHTMLPage)
                                                        .then((response) => {
                                                            console.log(response);
                                                        })
                                                })
                                        })
                                })
                        });
                })
        })
}  