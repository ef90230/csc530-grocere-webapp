import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import InventoryScreen from '../pages/InventoryScreen';

// Mock fetch globally
global.fetch = jest.fn();

const mockItems = [
  {
    id: 1,
    name: 'Apple',
    upc: '123456789012',
    category: 'Fruits',
    locations: [
      {
        quantityOnHand: 10,
        location: {
          aisle: { aisleNumber: 1 }
        }
      }
    ]
  },
  {
    id: 2,
    name: 'Banana',
    upc: '234567890123',
    category: 'Fruits',
    locations: [
      {
        quantityOnHand: 5,
        location: {
          aisle: { aisleNumber: 2 }
        }
      }
    ]
  },
  {
    id: 3,
    name: 'Orange',
    upc: '345678901234',
    category: 'Fruits',
    locations: [
      {
        quantityOnHand: 15,
        location: {
          aisle: { aisleNumber: 1 }
        }
      }
    ]
  },
  {
    id: 4,
    name: 'Milk',
    upc: '456789012345',
    category: 'Dairy',
    locations: [
      {
        quantityOnHand: 8,
        location: {
          aisle: { aisleNumber: 3 }
        }
      }
    ]
  },
  {
    id: 5,
    name: 'Bread',
    upc: '567890123456',
    category: 'Bakery',
    locations: [] // No location
  }
];

const mockApiResponse = {
  success: true,
  items: mockItems
};

describe('InventoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse)
    });
  });

  const renderWithRouter = (component) => {
    return render(
      <MemoryRouter>
        {component}
      </MemoryRouter>
    );
  };

  describe('Search Functionality', () => {
    test('displays all items when no search term is entered', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.getByText('Banana')).toBeInTheDocument();
        expect(screen.getByText('Orange')).toBeInTheDocument();
        expect(screen.getByText('Milk')).toBeInTheDocument();
        expect(screen.getByText('Bread')).toBeInTheDocument();
      });
    });

    test('filters items by exact UPC match', async () => {
      renderWithRouter(<InventoryScreen />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      // Search for specific UPC
      const searchInput = screen.getByPlaceholderText('Search by name or UPC');
      fireEvent.change(searchInput, { target: { value: '123456789012' } });

      // Wait for re-render with filtered results
      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.queryByText('Banana')).not.toBeInTheDocument();
        expect(screen.queryByText('Orange')).not.toBeInTheDocument();
        expect(screen.queryByText('Milk')).not.toBeInTheDocument();
        expect(screen.queryByText('Bread')).not.toBeInTheDocument();
      });
    });

    test('filters items by partial name match (case insensitive)', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or UPC');
      fireEvent.change(searchInput, { target: { value: 'app' } });

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.queryByText('Banana')).not.toBeInTheDocument();
        expect(screen.queryByText('Orange')).not.toBeInTheDocument();
        expect(screen.queryByText('Milk')).not.toBeInTheDocument();
        expect(screen.queryByText('Bread')).not.toBeInTheDocument();
      });
    });

    test('filters items by partial UPC match', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or UPC');
      fireEvent.change(searchInput, { target: { value: '12345' } });

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.getByText('Milk')).toBeInTheDocument();
        expect(screen.getByText('Bread')).toBeInTheDocument();
        expect(screen.queryByText('Banana')).not.toBeInTheDocument();
        expect(screen.queryByText('Orange')).not.toBeInTheDocument();
      });
    });

    test('shows "No items found." when search yields no results', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or UPC');
      fireEvent.change(searchInput, { target: { value: 'nonexistentitem' } });

      await waitFor(() => {
        expect(screen.getByText('No items found.')).toBeInTheDocument();
        expect(screen.queryByText('Apple')).not.toBeInTheDocument();
        expect(screen.queryByText('Banana')).not.toBeInTheDocument();
        expect(screen.queryByText('Orange')).not.toBeInTheDocument();
        expect(screen.queryByText('Milk')).not.toBeInTheDocument();
        expect(screen.queryByText('Bread')).not.toBeInTheDocument();
      });
    });

    test('shows multiple items when search matches multiple names', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or UPC');
      fireEvent.change(searchInput, { target: { value: 'an' } }); // Should match Banana

      await waitFor(() => {
        expect(screen.getByText('Banana')).toBeInTheDocument();
        expect(screen.getByText('Orange')).toBeInTheDocument();
        expect(screen.queryByText('Apple')).not.toBeInTheDocument();
        expect(screen.queryByText('Milk')).not.toBeInTheDocument();
        expect(screen.queryByText('Bread')).not.toBeInTheDocument();
      });
    });
  });

  describe('Sort/Filter Functionality', () => {
    test('sorts by name ascending (A-Z) by default', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const rows = screen.getAllByRole('row').slice(1); // Skip header row
      expect(rows[0]).toHaveTextContent('Apple');
      expect(rows[1]).toHaveTextContent('Banana');
      expect(rows[2]).toHaveTextContent('Bread');
      expect(rows[3]).toHaveTextContent('Milk');
      expect(rows[4]).toHaveTextContent('Orange');
    });

    test('sorts by name descending (Z-A) when selected', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Name (A‑Z)');
      fireEvent.change(sortSelect, { target: { value: 'name_desc' } });

      await waitFor(() => {
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows[0]).toHaveTextContent('Orange');
        expect(rows[1]).toHaveTextContent('Milk');
        expect(rows[2]).toHaveTextContent('Bread');
        expect(rows[3]).toHaveTextContent('Banana');
        expect(rows[4]).toHaveTextContent('Apple');
      });
    });

    test('sorts by lowest stock first when selected', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Name (A‑Z)');
      fireEvent.change(sortSelect, { target: { value: 'stock_desc' } });

      await waitFor(() => {
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows[0]).toHaveTextContent('Bread'); // 0 stock (no locations)
        expect(rows[1]).toHaveTextContent('Banana'); // 5 stock
        expect(rows[2]).toHaveTextContent('Milk'); // 8 stock
        expect(rows[3]).toHaveTextContent('Apple'); // 10 stock
        expect(rows[4]).toHaveTextContent('Orange'); // 15 stock
      });
    });

    test('sorts by category then name when selected', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Name (A‑Z)');
      fireEvent.change(sortSelect, { target: { value: 'category' } });

      await waitFor(() => {
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows[0]).toHaveTextContent('Bread'); // Bakery
        expect(rows[1]).toHaveTextContent('Milk'); // Dairy
        expect(rows[2]).toHaveTextContent('Apple'); // Fruits
        expect(rows[3]).toHaveTextContent('Banana'); // Fruits
        expect(rows[4]).toHaveTextContent('Orange'); // Fruits
      });
    });

    test('sorts by aisle number when selected', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Name (A‑Z)');
      fireEvent.change(sortSelect, { target: { value: 'aisle' } });

      await waitFor(() => {
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows[0]).toHaveTextContent('Bread'); // No aisle
        expect(rows[1]).toHaveTextContent('Apple'); // Aisle 1
        expect(rows[2]).toHaveTextContent('Orange'); // Aisle 1
        expect(rows[3]).toHaveTextContent('Banana'); // Aisle 2
        expect(rows[4]).toHaveTextContent('Milk'); // Aisle 3
      });
    });

    test('filters to show only items with no location when selected', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Name (A‑Z)');
      fireEvent.change(sortSelect, { target: { value: 'noLocation' } });

      await waitFor(() => {
        expect(screen.getByText('Bread')).toBeInTheDocument();
        expect(screen.queryByText('Apple')).not.toBeInTheDocument();
        expect(screen.queryByText('Banana')).not.toBeInTheDocument();
        expect(screen.queryByText('Orange')).not.toBeInTheDocument();
        expect(screen.queryByText('Milk')).not.toBeInTheDocument();
      });
    });
  });

  describe('Combined Search and Sort', () => {
    test('applies search filter after sort selection', async () => {
      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      // First apply a sort
      const sortSelect = screen.getByDisplayValue('Name (A‑Z)');
      fireEvent.change(sortSelect, { target: { value: 'stock_desc' } });

      await waitFor(() => {
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows[0]).toHaveTextContent('Bread'); // Lowest stock first (0 stock)
      });

      // Then apply search
      const searchInput = screen.getByPlaceholderText('Search by name or UPC');
      fireEvent.change(searchInput, { target: { value: 'Milk' } });

      await waitFor(() => {
        expect(screen.getByText('Milk')).toBeInTheDocument();
        expect(screen.queryByText('Banana')).not.toBeInTheDocument();
        expect(screen.queryByText('Apple')).not.toBeInTheDocument();
      });
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading message while fetching data', () => {
      // Mock a slow response
      fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithRouter(<InventoryScreen />);

      expect(screen.getByText('Loading items…')).toBeInTheDocument();
    });

    test('shows error message when fetch fails', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    test('shows error message when API returns error', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          message: 'Database connection failed'
        })
      });

      renderWithRouter(<InventoryScreen />);

      await waitFor(() => {
        expect(screen.getByText('Database connection failed')).toBeInTheDocument();
      });
    });
  });
});