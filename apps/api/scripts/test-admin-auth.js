async function testAdminLogin() {
    const baseURL = 'http://localhost:3001/api';
    const email = 'admin@tarodan.com';
    const password = 'Admin123!';

    try {
        console.log('Testing login...');
        const loginRes = await fetch(`${baseURL}/auth/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!loginRes.ok) {
            const errorData = await loginRes.json();
            console.error('Login Error Status:', loginRes.status);
            console.error('Login Error Data:', errorData);
            return;
        }

        const loginData = await loginRes.json();
        console.log('Login Success!');
        const token = loginData.tokens.accessToken;
        console.log('Token received.');

        console.log('Testing protected route /admin/dashboard ...');
        const dashboardRes = await fetch(`${baseURL}/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Dashboard Res Status:', dashboardRes.status);
        const dashboardData = await dashboardRes.json();
        if (!dashboardRes.ok) {
            console.error('Dashboard Error Data:', dashboardData);
        } else {
            console.log('Dashboard Success!');
            console.log('Data:', JSON.stringify(dashboardData).substring(0, 100));
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testAdminLogin();
