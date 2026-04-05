const PARKING_SPACES_STORAGE_KEY = 'grocereParkingSpaces';
const MAX_SPACES = 200;
const DEFAULT_SPACE_COUNT = 7;

export const toParkingSpaceNumber = (value) => {
  const parsedValue = Number(String(value ?? '').trim());
  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > MAX_SPACES) {
    return null;
  }

  return parsedValue;
};

export const getConfiguredParkingSpaces = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PARKING_SPACES_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalizedSpaces = parsed
      .map((space) => {
        if (typeof space === 'number') {
          return toParkingSpaceNumber(space);
        }

        if (space && typeof space === 'object') {
          return toParkingSpaceNumber(space.id);
        }

        return null;
      })
      .filter(Boolean);

    return Array.from(new Set(normalizedSpaces)).sort((left, right) => left - right);
  } catch {
    return [];
  }
};

const buildDefaultSpaces = (count = DEFAULT_SPACE_COUNT) => (
  Array.from({ length: Math.max(1, count) }, (_, index) => index + 1)
);

export const getParkingSpaceOptions = ({ occupiedSpaces = [], includeSpaces = [] } = {}) => {
  const configuredSpaces = getConfiguredParkingSpaces();
  const seedSpaces = configuredSpaces.length > 0 ? configuredSpaces : buildDefaultSpaces();

  const allCandidateSpaces = [...seedSpaces, ...occupiedSpaces, ...includeSpaces]
    .map((spaceValue) => toParkingSpaceNumber(spaceValue))
    .filter(Boolean);

  return Array.from(new Set(allCandidateSpaces)).sort((left, right) => left - right);
};

export const collectOccupiedParkingSpaces = (orders, excludedOrderId = null) => {
  const rows = Array.isArray(orders) ? orders : [];

  return rows.reduce((spaceSet, order) => {
    if (excludedOrderId && Number(order?.id) === Number(excludedOrderId)) {
      return spaceSet;
    }

    const normalizedStatus = String(order?.status || '').toLowerCase();
    if (['cancelled', 'canceled', 'completed'].includes(normalizedStatus)) {
      return spaceSet;
    }

    const resolvedSpace = toParkingSpaceNumber(order?.parkingSpot);
    if (!resolvedSpace) {
      return spaceSet;
    }

    spaceSet.add(resolvedSpace);
    return spaceSet;
  }, new Set());
};
