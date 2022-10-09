let paused;

// pause and resume button should have same size
document.getElementById("uploadWindow-button-resume").style.width = "165px";
document.getElementById("uploadWindow-button-pause").style.width = "165px";

// submit button not visible until file is a valid *.las-file
// ============================================================================
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

// show pointcloud if successfully uploaded
// ============================================================================
document.getElementById("uploadWindow-button-show").onclick = function() {

}

// cancel upload: delete database entry and files, renew upload page
// ============================================================================
document.getElementById("uploadWindow-button-cancel").onclick = function() {
    // TODO: Delete pointcloud entry and folders here
    window.location.href = "/upload";
}

// upload is paused
// ============================================================================
document.getElementById("uploadWindow-button-pause").onclick = function() {
    paused = true;
    document.getElementById("uploadWindow-button-pause").hidden = true;
    document.getElementById("uploadWindow-button-resume").hidden = false;
}

/*============================================================================
    listener validates and uploads the file after the submit button is pressed
============================================================================*/
document.getElementById("uploadForm").addEventListener("submit", handleForm);
function handleForm(event) {
    event.preventDefault();
    paused = false;
    let originalFile = document.getElementById("fileToUpload").files[0];
    document.getElementById("inputCloudname").disabled = true;
    let inputCloudname = document.getElementById("inputCloudname").value;

    // see if pointcloud entry exists already
    let getRequest = new Request("pointcloud/" + inputCloudname, {
        method: "GET",
    });
    fetch(getRequest)
        .then(getResponse => getResponse.json())
        .then(async cloud_obj => {
            // if entry exists, ask user to override
            if (Object.entries(cloud_obj).length != 0) {
                let override = window.confirm("The name of this point cloud already exists. Would you like to override it?");
                if (!override) {
                    showFileChooserAndSubmitButton(true);
                    showProgress(false);
                    document.getElementById("inputCloudname").disabled = false;
                    return;
                }
            }
            showFileChooserAndSubmitButton(false);
            showUploadControlButtons(true);
            showProgress(true);

            // start multipart-upload
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

                    // recursive upload-function
                    // ============================================================================
                    async function processChunk(part, of) {
                        if (part < of) {
                            if (paused) {
                                // wait for click on "resume upload"
                                await new Promise(resolve => {
                                    document.getElementById('uploadWindow-button-resume').addEventListener('click', e => {
                                        paused = false;
                                        document.getElementById("uploadWindow-button-resume").hidden = true;
                                        document.getElementById("uploadWindow-button-pause").hidden = false;
                                      resolve(e);
                                    });
                                })
                            }
                            let offset = part * CHUNKSIZE;

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
                                .then(async (response) => {
                                    if (response.status != 200) {
                                        document.getElementById("uploadLasProgressBar").className = "errorBar";
                                        document.getElementById("uploadLasProgressInformation").innerHTML = "error while uploading: server status response = " + response.status;
                                        showUploadControlButtons(false);
                                        showOKButton(true);
                                        return;
                                    } else {
                                        updateUploadLasProgressStatus(part, of);
                                        // after successfully sending the current chunk, process next chunk recursively
                                        await processChunk(part + 1, of);
                                    }
                                })
                        }
                    }

                    // slice original file into chunks and send them one after another
                    let chunks = Math.ceil(originalFile.size / CHUNKSIZE, CHUNKSIZE);
                    let chunk = 0;
                    await processChunk(chunk, chunks)
                        // all chunks already processed at this point because processChunk is recursive
                        // finish multipart-upload
                        .then(async () => {
                            showUploadControlButtons(false);
                            console.log("Start with completion of the upload");
                            let requestForCompleting = new Request("multipart-upload/complete-upload", {
                                body: new URLSearchParams("id=" + CLOUD_ID + "&" + "cloud_name=" + inputCloudname),
                                method: "POST",
                            });
                            fetch(requestForCompleting)
                                .then((response) => {
                                    console.log(response);
                                    if (response.status != 200) {
                                        document.getElementById("uploadLasProgressBar").className = "errorBar";
                                        document.getElementById("uploadLasProgressBar").innerHTML = "error while uploading: server status response = " + response.status;
                                        showOKButton(true);
                                    }
                                    let requestForConverting = new Request('convertFile/' + CLOUD_ID, {
                                        method: 'PATCH',
                                    })
                                    // TODO: progress-bar animation
                                    fetch(requestForConverting)
                                        .then((response) => {
                                            showUploadControlButtons(false);
                                            console.log(response);
                                            if (response.status != 200) {
                                                document.getElementById("convertingProgressBar").className = "errorBar";
                                                document.getElementById("convertingProgressInformation").innerHTML = "error while converting: server status response = " + response.status;
                                                showOKButton(true);
                                                return;
                                            }
                                            showConvertingSuccessful();
                                            let requestForSendingToS3 = new Request('sendToS3/' + CLOUD_ID, {
                                                method: 'PATCH'
                                            })
                                            fetch(requestForSendingToS3)
                                                .then((response) => {
                                                    console.log(response);
                                                    if (response.status != 200) {
                                                        document.getElementById("uploadToS3ProgressBar").className = "errorBar";
                                                        document.getElementById("uploadToS3ProgressInformation").innerHTML = "error while converting: server status response = " + response.status;
                                                        showOKButton(true);
                                                        return;
                                                    }
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
                        })
                })
        })

    // other helper functions
    // ============================================================================
    function showProgress(boolean) {
        document.getElementById("progress").hidden = !boolean;
    }
    function showFileChooserAndSubmitButton(boolean) {
        document.getElementById("fileToUpload").hidden = !boolean;
        document.getElementById("uploadSubmitButton").hidden = !boolean;
    }
    function showUploadControlButtons(boolean) {
        document.getElementById("uploadWindow-button-cancel").hidden = !boolean;
        document.getElementById("uploadWindow-button-pause").hidden = !boolean;
        document.getElementById("uploadWindow-button-resume").hidden = true;
    }
    function showOKButton(boolean) {
        document.getElementById("uploadWindow-button-ok").hidden = !boolean;
    }
    function showShowPointcloudButton(boolean) {
        document.getElementById("uploadWindow-button-show").hidden = !boolean;
    }
    function updateUploadLasProgressStatus(part, of) {
        let info = document.getElementById("uploadLasProgressInformation");
        document.getElementById("uploadLasProgressBar").style.backgroundSize = ((part + 1) * 100 / of) + "% 100%";
        info.innerHTML = part + 1 + " of " + of;
        if (part + 1 == of) {
            info.innerHTML = "las-file upload completed (" + info.innerHTML + ")";
        }
    }
    function showConvertingSuccessful() {
        document.getElementById("convertingProgressInformation").innerHTML = "Successfully converted.";
        document.getElementById("convertingProgressBar").style.backgroundSize = "100% 100%";
    }
}  