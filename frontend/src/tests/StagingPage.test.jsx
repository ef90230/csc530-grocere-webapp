import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import StagingPage from '../pages/StagingPage';

jest.mock('../components/common/TopBar', () => () => <div>TopBar</div>);
jest.mock('../components/common/Navbar', () => () => <div>Navbar</div>);

jest.mock('../components/common/BarcodeScannerModal', () => {
  return function MockBarcodeScannerModal({ isOpen, statusMessage, onDetected }) {
    if (!isOpen) {
      return null;
    }

    return (
      <div>
        <p>{statusMessage}</p>
        <button type="button" onClick={() => onDetected('999999999999')}>Scan Cart UPC</button>
        <button type="button" onClick={() => onDetected('123456789012')}>Scan Item UPC</button>
        <button type="button" onClick={() => onDetected('222222222222')}>Scan Location A</button>
        <button type="button" onClick={() => onDetected('333333333333')}>Scan Location B</button>
      </div>
    );
  };
});

const API_BASE = 'http://localhost:5000';

const buildOrder = ({ includeSecondCommodity = false } = {}) => ({
  id: 101,
  orderNumber: 'ORD-101',
  status: 'staging',
  scheduledPickupTime: '2026-04-12T14:00:00.000Z',
  customer: {
    firstName: 'Alex',
    lastName: 'Rivera',
    cart: {
      upc: '999999999999'
    }
  },
  items: [
    {
      id: 1,
      quantity: 1,
      pickedQuantity: 1,
      status: 'found',
      item: {
        commodity: 'ambient',
        upc: '123456789012',
        name: 'Cereal'
      }
    },
    ...(includeSecondCommodity
      ? [{
          id: 2,
          quantity: 1,
          pickedQuantity: 1,
          status: 'found',
          item: {
            commodity: 'chilled',
            upc: '555555555555',
            name: 'Milk'
          }
        }]
      : [])
  ]
});

const stagingLocationsPayload = {
  locations: [
    { id: 10, name: 'Ambient A1', itemType: 'ambient', stagingLimit: 10, toteCount: 0, upc: '222222222222' },
    { id: 11, name: 'Ambient A2', itemType: 'ambient', stagingLimit: 10, toteCount: 0, upc: '333333333333' },
    { id: 20, name: 'Chilled C1', itemType: 'chilled', stagingLimit: 10, toteCount: 0, upc: '444444444444' }
  ]
};

const renderPage = () => render(
  <MemoryRouter>
    <StagingPage />
  </MemoryRouter>
);

describe('StagingPage scanner safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('authToken', 'token');
    window.localStorage.setItem('userType', 'employee');
    global.fetch = jest.fn();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  const setupFetch = ({ orders, assignments }) => {
    global.fetch.mockImplementation((url, options = {}) => {
      const method = String(options.method || 'GET').toUpperCase();

      if (url === `${API_BASE}/api/auth/me`) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { storeId: 1 } })
        });
      }

      if (url === `${API_BASE}/api/orders?storeId=1`) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ orders })
        });
      }

      if (url === `${API_BASE}/api/staging-locations` && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(stagingLocationsPayload)
        });
      }

      if (url === `${API_BASE}/api/staging-locations/assignments` && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ assignments })
        });
      }

      if (url === `${API_BASE}/api/staging-locations/assignments` && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });
      }

      throw new Error(`Unhandled fetch: ${method} ${url}`);
    });
  };

  const countAssignmentPosts = () => global.fetch.mock.calls.filter(([url, options = {}]) => (
    url === `${API_BASE}/api/staging-locations/assignments`
    && String(options.method || 'GET').toUpperCase() === 'POST'
  )).length;

  test('shows an error when scanned UPC matches an item UPC instead of a tote location UPC', async () => {
    setupFetch({
      orders: [buildOrder()],
      assignments: []
    });

    renderPage();

    await screen.findByText('Alex Rivera');

    fireEvent.click(screen.getByRole('button', { name: /alex rivera/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    fireEvent.click(screen.getByRole('button', { name: 'Scan Cart UPC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scan Item UPC' }));

    expect(await screen.findByText('Scanned UPC belongs to an item, not a tote location. Scan a tote location UPC.')).toBeInTheDocument();
    expect(countAssignmentPosts()).toBe(0);
  });

  test('shows a warning when a different location UPC is scanned for an already staged group and requires confirmation', async () => {
    setupFetch({
      orders: [buildOrder({ includeSecondCommodity: true })],
      assignments: [
        {
          id: 301,
          orderId: 101,
          commodity: 'ambient',
          stagingLocationId: 10,
          stagingLocation: {
            id: 10,
            name: 'Ambient A1',
            itemType: 'ambient',
            upc: '222222222222'
          }
        }
      ]
    });

    renderPage();

    await screen.findByText('Alex Rivera');

    fireEvent.click(screen.getByRole('button', { name: /alex rivera/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }));

    fireEvent.click(screen.getByRole('button', { name: 'Scan Cart UPC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scan Location B' }));

    expect(await screen.findByText('Warning: this order is already staged in another location. Scan this new location UPC again to confirm reassignment.')).toBeInTheDocument();
    expect(countAssignmentPosts()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Scan Location B' }));

    await waitFor(() => {
      expect(countAssignmentPosts()).toBe(1);
    });
  });
});
