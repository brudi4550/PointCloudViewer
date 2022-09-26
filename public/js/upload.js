document.getElementById("uploadForm").addEventListener("submit", handleForm);
/*============================================================================

============================================================================*/
function handleForm(event) {
    event.preventDefault();

    let uploadForm = event.target;
    // let formData = new FormData(uploadForm);

    let originalFile = document.getElementById("fileToUpload").files[0];

    // Anfrage für einen neuen Multipart-Upload senden
    let postRequest = new Request("http://localhost:3000/multipart-upload", {
        method: "POST",
    });
    fetch(postRequest)
        .then((postResponse) => {
            // Antwort verarbeiten
            console.log(postResponse.status);
            // console.log("Location-Header = ", postResponse.headers.get("Location"));
            // console.log("http://localhost:3000" + postResponse.headers.get("Location"));
            const UPLOADURL = "http://localhost:3000" + postResponse.headers.get("Location");
            postResponse.json()
                .then(data => {
                    const CHUNKSIZE = 1024 * 1024 / 2; 
                    function verarbeite(part, von) {
                        if (part < von) {
                            let offset = part * CHUNKSIZE;
                            console.log("Verarbeite Part " + (part + 1).toString() + " von " + von.toString());
                            let formData = new FormData();
                            formData.append("part", part);
                            formData.append("id", data.id);
                            formData.append("fileToUpload", originalFile.slice(offset, offset + CHUNKSIZE));
                            let request = new Request(UPLOADURL, { 
                                body: formData,
                                method: "PUT",
                            });
                            fetch(request)
                                .then((response) => response.json())
                                .then((data) => {
                                     console.log("Antwort vom Server:", data);
                                })
                                .then(() => {
                                    verarbeite(part + 1, von);
                                });   
                        }
                    }
                    // console.log("Antwort vom Server:", data);
                    // console.log(data.id);
                    // const uploadURL = "http://localhost:3000" + postResponse.headers.get("Location");

                    // Put-Reuquests versenden
                    // const CHUNKSIZE = 1024 * 1024 * 10; // = 10 Mebibyte
                    // const CHUNKSIZE = 1024 * 1024 / 2; // = 1/2 Mebibyte // TODO: chunksize abhängig vom server setzen

                    // Upload-Datei in Teile zerlegen und versenden
                    let chunks = Math.ceil(originalFile.size / CHUNKSIZE, CHUNKSIZE);
                    let chunk = 0;
                    // let offset = chunk * CHUNKSIZE;

                    verarbeite(chunk, chunks);
                    // while (chunk < chunks) {
                    //     // Zu neuer Seite leiten und Fortschritt des Uploads anzeigen?


                    //     // console.log("=====================================================")
                    //     let offset = chunk * CHUNKSIZE;
                    //     // console.log('current chunk..', chunk);
                    //     // console.log('offset...', chunk * CHUNKSIZE);
                    //     // console.log('file blob from offset...', offset)
                    //     // console.log(originalFile.slice(offset, offset + CHUNKSIZE));

                    //     let formData = new FormData();
                    //     formData.append("checksumAlgorithm", "MD5");
                    //     formData.append("part", chunk + 1);
                    //     formData.append("id", data.id);
                    //     formData.append("fileToUpload", originalFile.slice(offset, offset + CHUNKSIZE));
                    //     let request = new Request(uploadURL, { 
                    //         body: formData,
                    //         method: "PUT",
                    //     });
                    //     fetch(request)
                    //         .then((response) => response.json())
                    //         .then((data) => {
                    //             console.log("Antwort vom Server:", data);
                    //             uploadForm.reset();
                    //     });
                    //     chunk++;
                    // }
                })

        });
}  