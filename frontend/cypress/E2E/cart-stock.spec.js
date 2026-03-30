/// <reference types="cypress" />
/* global cy */

describe('Customer cart stock protections', () => {
  const apiBase = 'http://localhost:5000';

  const visitAsCustomer = (path) => {
    cy.visit(`http://localhost:3000${path}`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('authToken', 'test-token');
        win.localStorage.setItem('userType', 'customer');
      }
    });
  };

  const interceptCustomerProfile = () => {
    cy.intercept('GET', `${apiBase}/api/auth/me`, {
      statusCode: 200,
      body: {
        user: {
          id: 123,
          firstName: 'Cypress',
          preferredStoreId: 1
        }
      }
    }).as('getProfile');
  };

  const interceptCustomerOrders = () => {
    cy.intercept('GET', `${apiBase}/api/orders?customerId=123`, {
      statusCode: 200,
      body: {
        success: true,
        orders: []
      }
    }).as('getOrders');
  };

  it('does not allow shoppers to add out-of-stock items to the cart', () => {
    let addToCartCalls = 0;

    interceptCustomerProfile();
    interceptCustomerOrders();
    cy.intercept('GET', `${apiBase}/api/cart/123`, {
      statusCode: 200,
      body: {
        success: true,
        cart: {
          id: 1,
          items: [],
          totalQuantity: 0
        }
      }
    }).as('getCart');
    cy.intercept('GET', `${apiBase}/api/items?storeId=1`, {
      statusCode: 200,
      body: {
        success: true,
        items: [
          {
            id: 900,
            name: 'Sold Out Soup',
            price: 2.99,
            isActive: true,
            locations: [
              { quantityOnHand: 0, storeId: 1 }
            ]
          }
        ]
      }
    }).as('getItems');
    cy.intercept('POST', `${apiBase}/api/cart/123/items`, (req) => {
      addToCartCalls += 1;
      req.reply({ statusCode: 201, body: { success: true, cart: { totalQuantity: 1, items: [] } } });
    }).as('addToCart');

    visitAsCustomer('/storefront');
    cy.wait(['@getProfile', '@getItems', '@getCart', '@getOrders']);

    cy.contains('h2', 'Sold Out Soup')
      .parents('article')
      .within(() => {
        cy.contains('button', 'Out of stock').should('be.disabled');
      });

    cy.then(() => {
      expect(addToCartCalls).to.equal(0);
    });
  });

  it('does not allow customers to add more quantity than the current on hand', () => {
    const requestedQuantities = [];

    interceptCustomerProfile();
    interceptCustomerOrders();
    cy.intercept('GET', `${apiBase}/api/cart/123`, {
      statusCode: 200,
      body: {
        success: true,
        cart: {
          id: 1,
          items: [],
          totalQuantity: 0
        }
      }
    }).as('getCart');
    cy.intercept('GET', `${apiBase}/api/items?storeId=1`, {
      statusCode: 200,
      body: {
        success: true,
        items: [
          {
            id: 901,
            name: 'Limited Beans',
            price: 3.49,
            isActive: true,
            locations: [
              { quantityOnHand: 2, storeId: 1 }
            ]
          }
        ]
      }
    }).as('getItems');
    cy.intercept('POST', `${apiBase}/api/cart/123/store`, {
      statusCode: 200,
      body: { success: true, cart: { id: 1, storeId: 1 } }
    }).as('setStore');
    cy.intercept('POST', `${apiBase}/api/cart/123/items`, (req) => {
      requestedQuantities.push(req.body.quantity);
      req.reply({
        statusCode: 201,
        body: {
          success: true,
          cart: {
            id: 1,
            items: [
              {
                id: 1,
                quantity: req.body.quantity,
                item: { id: 901, name: 'Limited Beans', price: 3.49 }
              }
            ],
            totalQuantity: req.body.quantity,
            itemCount: 1,
            subtotal: 3.49 * req.body.quantity
          }
        }
      });
    }).as('addToCart');

    visitAsCustomer('/storefront');
    cy.wait(['@getProfile', '@getItems', '@getCart', '@getOrders']);

    cy.contains('h2', 'Limited Beans')
      .parents('article')
      .within(() => {
        cy.get('.storefront-quantity-picker__button--plus').click();
        cy.get('.storefront-quantity-picker__value').should('have.text', '2');
        cy.get('.storefront-quantity-picker__button--plus').should('be.disabled');
        cy.contains('button', 'Add to Cart').click();
      });

    cy.wait(['@setStore', '@addToCart']);
    cy.then(() => {
      expect(requestedQuantities).to.deep.equal([2]);
    });
  });

  it('removes cart items on refresh after their on-hand falls to zero', () => {
    let cartLoads = 0;

    interceptCustomerProfile();
    cy.intercept('GET', `${apiBase}/api/cart/123`, (req) => {
      cartLoads += 1;
      if (cartLoads === 1) {
        req.reply({
          statusCode: 200,
          body: {
            success: true,
            cart: {
              id: 1,
              storeId: 1,
              items: [
                {
                  id: 55,
                  quantity: 1,
                  item: {
                    id: 902,
                    name: 'Greek Yogurt',
                    price: 4.25,
                    imageUrl: ''
                  }
                }
              ],
              totalQuantity: 1,
              itemCount: 1,
              subtotal: 4.25
            }
          }
        });
        return;
      }

      req.reply({
        statusCode: 200,
        body: {
          success: true,
          cart: {
            id: 1,
            storeId: 1,
            items: [],
            totalQuantity: 0,
            itemCount: 0,
            subtotal: 0
          }
        }
      });
    }).as('getCart');

    visitAsCustomer('/cart');
    cy.wait(['@getProfile', '@getCart']);
    cy.contains('Greek Yogurt').should('be.visible');

    cy.reload();
    cy.wait(['@getProfile', '@getCart']);
    cy.contains('Your cart is empty!').should('be.visible');
    cy.contains('Greek Yogurt').should('not.exist');
  });
});
