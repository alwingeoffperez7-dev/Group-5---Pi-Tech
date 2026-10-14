document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginFeedback = document.getElementById('loginFeedback');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const submitterButton = event.submitter;
            const userRole = submitterButton.value;

            const formData = new FormData(loginForm);
            formData.append('role', userRole);

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    body: formData
                });

               const result = await response.json();

               if (result.success) {
                loginFeedback.textContent = 'Login successful! Redirecting...';
                window.location.href = userRole === 'admin' ? '../system.html/admin-page.html' : '../system.html/vendor-page.html';
               } else {
                loginFeedback.textContent = result.message || "Invalid email or password.";
               }
            } catch (error) {
                console.error("Login fetch error:", error);
                loginFeedback.textContent = "Error connecting to the server.";
            }

        });
    }
});