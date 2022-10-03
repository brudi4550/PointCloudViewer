document.getElementById("uploadForm").addEventListener("submit", handleForm);

function handleForm(event) {
    event.preventDefault();

    let uploadForm = event.target;

    let originalFile = document.getElementById("fileToUpload").files[0];
    alert(originalFile.type);

    // send new multipart-upload-request
    let postRequest = new Request("http://localhost:3000/multipart-upload", {
        method: "POST",
    });
    fetch(postRequest)
        .then((postResponse) => {
            // postResponse-body holds upload-id
            const UPLOADURL = "http://localhost:3000" + postResponse.headers.get("Location");
            postResponse.json()
                .then(async uploadData => {
                    console.log(uploadData);
                    const CHUNKSIZE = 1024 * 1024 / 2; 

                    async function processChunk(part, of) {
                        // TODO: Zu neuer Seite leiten und Fortschritt des Uploads anzeigen?
                        if (part < of) {
                            let offset = part * CHUNKSIZE;
                            console.log("Verarbeite Part " + (part + 1).toString() + " von " + of.toString());

                            // prepare formdata
                            let formData = new FormData();
                            formData.append("part", part);
                            formData.append("id", uploadData.id);
                            formData.append("fileToUpload", originalFile.slice(offset, offset + CHUNKSIZE));

                            // send chunk
                            let request = new Request(UPLOADURL, { 
                                body: formData,
                                method: "PUT",
                            });
                            await fetch(request)
                                .then((response) => {
                                    if (response.status != 200) console.err("error");
                                    return response.json();
                                })   
                                .then((data) => {
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
                            let requestForCompleting = new Request("http://localhost:3000/multipart-upload/?/completeUpload".replace("?", uploadData.id), {
                                method: "POST",
                            });
                            fetch(requestForCompleting)
                                .then((response) => {
                                    console.log(response.json());
                                })
                        });
                })
        });
}  