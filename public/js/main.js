const modal_button = document.getElementById('modal-button');
const modal = document.getElementById('modal');
var close_button = document.getElementById('close-modal');

modal_button.onclick = function () {
    modal.style.display = "block";
}

close_button.onclick = function () {
    modal.style.display = "none";
}

window.onclick = function (event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

const navbar_brand = document.getElementById('navbar-brand');
navbar_brand.addEventListener('click', () => {
    var loc = window.location;
    window.location = loc.protocol + '//' + loc.host + loc.pathname + loc.search;
});
