const modal_button = document.getElementById('modal-button');
const modal = document.getElementById('modal');
var close_button = document.getElementById('close-modal');
let deletionButtons = document.getElementsByClassName("deletionButton");


try{
    modal_button.onclick = function () {
    modal.style.display = "block";
    }
} catch( error) {}

try{
    close_button.onclick = function () {
        modal.style.display = "none";
    }
} catch( error) {}

try{
    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
} catch( error) {}

const navbar_brand = document.getElementById('navbar-brand');
navbar_brand.addEventListener('click', () => {
    var loc = window.location;
    window.location = loc.protocol + '//' + loc.host + loc.pathname + loc.search;
});

function deletePointCloud(pointcloudName) {
    console.log('delete request: pointcloud ' + pointcloudName)
    fetch('/pointcloud/'+pointcloudName, {
        method: "DELETE"
    })
    .then(res => {
        console.log(res);
        window.location.reload();
    });
}
function deleteUser() {
    console.log('delete request: user');
    fetch('/userDeletion', {
        method: "DELETE"
    })
    .then(res => {
        if(res.status === 200) {
            window.alert('User got deleted');
        } else {
            window.alert('Something went wrong');
        }
    });
}