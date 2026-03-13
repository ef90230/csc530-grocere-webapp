describe('Scheduling API E2E tests', () => {
  const baseUrl = 'http://localhost:5000';
  let customerToken;
  let storeId;

  before(() => {
    // create a store and a customer using API calls
    cy.request('POST', `${baseUrl}/api/auth/register/customer`, {
      customerId: 'CYPRESS1',
      firstName: 'Cypress',
      lastName: 'User',
      email: 'cypress@example.com',
      password: 'password123',
      phone: '555-0000'
    }).then(() => {
      cy.request('POST', `${baseUrl}/api/auth/login`, {
        email: 'cypress@example.com',
        password: 'password123',
        userType: 'customer'
      }).then((resp) => {
        customerToken = resp.body.token;
      });
    });
    // create store directly via endpoint if any or assume ID 1
    storeId = 1;
  });

  it('should reject invalid time and accept valid time', () => {
    cy.request({
      method: 'POST',
      url: `${baseUrl}/api/orders/scheduling/validate/${storeId}`,
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { scheduledPickupTime: '2025-01-01T02:00:00Z' },
      failOnStatusCode: false
    }).its('status').should('eq', 400);

    cy.request({
      method: 'POST',
      url: `${baseUrl}/api/orders/scheduling/validate/${storeId}`,
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { scheduledPickupTime: '2025-01-01T08:00:00Z' }
    }).its('status').should('eq', 200);
  });

  it('can fetch slots list', () => {
    cy.request({
      method: 'GET',
      url: `${baseUrl}/api/orders/scheduling/slots/${storeId}?startDate=2025-01-01&endDate=2025-01-03`,
      headers: { Authorization: `Bearer ${customerToken}` }
    }).its('body').should('be.an', 'array');
  });
});
