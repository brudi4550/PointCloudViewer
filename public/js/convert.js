const convert_button = document.getElementById('convert');

convert_button.onclick = function convert() {
    document.getElementById('loading').style.visibility = 'visible'
    const form = document.createElement('form');
    form.method = 'post';
    form.action = 'http://localhost:3000/fileconvert';
    document.body.appendChild(form);
    form.submit().then(document.getElementById('loading').style.visibility = 'hidden');
}
