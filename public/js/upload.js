document.getElementById("uploadForm").addEventListener("submit", handleForm);
/*============================================================================

============================================================================*/
function handleForm(event) {
    // const CHUNKSIZE = 1024 * 1024 * 10; // = 10 Mebibyte
    const CHUNKSIZE = 1024 * 1024 / 2; // = 1/2 Mebibyte

    event.preventDefault();

    let uploadForm = event.target;
    // let formData = new FormData(uploadForm);

    let originalFile = document.getElementById("fileToUpload").files[0];

    // Anfrage für einen neuen Multipart-Upload senden
    // let request = new Request("http://localhost:3000/multipart-upload", {
    //     body: formData,
    //     method: "PUT",
    // });
    // fetch(request)
    //     .then((response) => response.json())
    //     .then((data) => {
    //         console.log("Antwort vom Server:", data);
    //         uploadForm.reset();
    // });

    // Upload-Datei in Teile zerlegen und versenden
    let chunks = Math.ceil(originalFile.size / CHUNKSIZE, CHUNKSIZE);
    let chunk = 0;
    while (chunk < chunks) {
        // Zu neuer Seite leiten und Fortschritt des Uploads anzeigen?


        console.log("=====================================================")
        let offset = chunk * CHUNKSIZE;
        console.log('current chunk..', chunk);
        console.log('offset...', chunk * CHUNKSIZE);
        console.log('file blob from offset...', offset)
        console.log(originalFile.slice(offset, offset + CHUNKSIZE));

        let formData = new FormData();
        formData.append("checksumAlgorithm", "MD5");
        formData.append("part", chunk + 1);
        formData.append("fileToUpload", originalFile.slice(offset, offset + CHUNKSIZE));
        let request = new Request("http://localhost:3000/multipart-upload", {
            body: formData,
            method: "POST",
        });
        fetch(request)
            .then((response) => response.json())
            .then((data) => {
                console.log("Antwort vom Server:", data);
                uploadForm.reset();
        });
        chunk++;
    }
}  