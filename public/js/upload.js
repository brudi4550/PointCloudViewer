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
                            console.log("Verarbeite Part " + (part + 1).toString() + " von " + von.toString());
        let formData = new FormData();
                            formData.append("part", part);
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
                    // console.log("Antwort vom Server:", data);
                    // console.log(data.id);
}  