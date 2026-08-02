
const firmForm = document.getElementById('firmForm');
if (firmForm) {
  firmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(firmForm).entries());
    console.log('ClaimAxis firm request:', data);
    firmForm.style.display = 'none';
    document.getElementById('firmSuccess').style.display = 'block';
  });
}
