document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const registerFeedback = document.getElementById('registerFeedback');

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(registerForm);

        try {
           const response = await fetch('/api/auth/register', {
            method: 'POST',
            body: formData
           });

           const result = await response.json();

           if (result.success) {
            registerFeedback.textContent = 'Registration successful! Redirecting to login page...';
            registerForm.reset();

            setTimeout(() => {
                window.location.href = 'log-in.html';
            }, 2000);
           } else {
            registerFeedback.textContent = result.message || "Registration failed. Email may already be in use.";
           }
        } catch (error) {
            console.error("Registration fetch error:",  error);
            registerFeedback.textContent = "Error connecting to the server.";
        }
        });
    }
});