function searchNameMyCloud() {
    var input, table, tr, td, i, txtValue;
    input = document.getElementById("searchMC").value.toUpperCase();
    table = document.getElementById("mycloud");
    tr = table.getElementsByTagName("tr");
    for (i = 0; i < tr.length; i++) {
        td = tr[i].getElementsByTagName("td")[0];
        if (td) {
            txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(input) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}

function searchNamePublicCloud() {
    var input, table, tr, td, i, txtValue;
    input = document.getElementById("searchPC").value.toUpperCase();
    table = document.getElementById("publicCloud");
    tr = table.getElementsByTagName("tr");
    for (i = 0; i < tr.length; i++) {
        td = tr[i].getElementsByTagName("td")[0];
        if (td) {
            txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(input) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}