const TERMINAL_BACKEND_STATUSES = new Set(['completed', 'cancelled', 'canceled']);

export const CUSTOMER_ORDER_PHASE = {
  ORDER_PLACED: 'order_placed',
  PICKING_IN_PROGRESS: 'picking_in_progress',
  PICKING_COMPLETE: 'picking_complete',
  STAGING_IN_PROGRESS: 'staging_in_progress',
  STAGING_COMPLETE: 'staging_complete',
  READY_FOR_PICKUP: 'ready_for_pickup',
  DISPENSING_IN_PROGRESS: 'dispensing_in_progress',
  ORDER_COMPLETE: 'order_complete',
  ORDER_CANCELED: 'order_canceled'
};

export const CUSTOMER_ORDER_STATUS_LABELS = {
  [CUSTOMER_ORDER_PHASE.ORDER_PLACED]: 'ORDER PLACED',
  [CUSTOMER_ORDER_PHASE.PICKING_IN_PROGRESS]: 'PICKING IN PROGRESS',
  [CUSTOMER_ORDER_PHASE.PICKING_COMPLETE]: 'PICKING COMPLETE',
  [CUSTOMER_ORDER_PHASE.STAGING_IN_PROGRESS]: 'STAGING IN PROGRESS',
  [CUSTOMER_ORDER_PHASE.STAGING_COMPLETE]: 'STAGING COMPLETE',
  [CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP]: 'READY FOR PICKUP',
  [CUSTOMER_ORDER_PHASE.DISPENSING_IN_PROGRESS]: 'DISPENSING IN PROGRESS',
  [CUSTOMER_ORDER_PHASE.ORDER_COMPLETE]: 'ORDER COMPLETE',
  [CUSTOMER_ORDER_PHASE.ORDER_CANCELED]: 'ORDER CANCELED'
};

export const CUSTOMER_ORDER_STATUS_TO_PILL_VARIANT = {
  [CUSTOMER_ORDER_PHASE.ORDER_PLACED]: 'picking_not_started',
  [CUSTOMER_ORDER_PHASE.PICKING_IN_PROGRESS]: 'picking_in_progress',
  [CUSTOMER_ORDER_PHASE.PICKING_COMPLETE]: 'picking_complete',
  [CUSTOMER_ORDER_PHASE.STAGING_IN_PROGRESS]: 'staging_in_progress',
  [CUSTOMER_ORDER_PHASE.STAGING_COMPLETE]: 'staging_complete',
  [CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP]: 'ready_for_pickup',
  [CUSTOMER_ORDER_PHASE.DISPENSING_IN_PROGRESS]: 'dispensing_in_progress',
  [CUSTOMER_ORDER_PHASE.ORDER_COMPLETE]: 'completed',
  [CUSTOMER_ORDER_PHASE.ORDER_CANCELED]: 'cancelled'
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateOrderTotalAtTimeOfOrdering = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];

  return items.reduce((sum, orderItem) => {
    const quantityOrdered = Math.max(0, toNumber(orderItem?.quantity));
    const originalItemPrice = Math.max(0, toNumber(orderItem?.item?.price));
    return sum + (quantityOrdered * originalItemPrice);
  }, 0);
};

export const calculateCurrentEstimatedOrderTotal = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const orderTotalAtTimeOfOrdering = calculateOrderTotalAtTimeOfOrdering(order);

  const adjustments = items.reduce((sum, orderItem) => {
    const quantityOrdered = Math.max(0, toNumber(orderItem?.quantity));
    const originalItemPrice = Math.max(0, toNumber(orderItem?.item?.price));
    const substituteItemPrice = Math.max(0, toNumber(orderItem?.substitutedItem?.price || orderItem?.substitutionItem?.price));
    const pickedQuantity = Math.max(0, toNumber(orderItem?.pickedQuantity));
    const normalizedStatus = String(orderItem?.status || '').toLowerCase();

    const notPickedOriginalQuantity = normalizedStatus === 'substituted'
      ? quantityOrdered
      : Math.max(0, quantityOrdered - pickedQuantity);

    const substitutePickedQuantity = normalizedStatus === 'substituted' && substituteItemPrice > 0
      ? Math.max(0, Math.min(quantityOrdered, pickedQuantity > 0 ? pickedQuantity : quantityOrdered))
      : 0;

    const removedOriginalValue = notPickedOriginalQuantity * originalItemPrice;
    const addedSubstituteValue = substitutePickedQuantity * substituteItemPrice;

    return sum - removedOriginalValue + addedSubstituteValue;
  }, 0);

  return Math.max(0, orderTotalAtTimeOfOrdering + adjustments);
};

const getLineItemState = (orderItem) => {
  const orderedQuantity = Math.max(0, toNumber(orderItem?.quantity));
  const pickedQuantity = Math.max(0, toNumber(orderItem?.pickedQuantity));
  const normalizedStatus = String(orderItem?.status || '').toLowerCase();

  if (normalizedStatus === 'found' || pickedQuantity >= orderedQuantity) {
    return 'resolved';
  }

  if (normalizedStatus === 'substituted' || normalizedStatus === 'out_of_stock' || normalizedStatus === 'skipped' || normalizedStatus === 'not_found' || normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') {
    return 'resolved';
  }

  if (pickedQuantity > 0) {
    return 'in_progress';
  }

  return 'pending';
};

const getOrderToteCount = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const commoditySet = new Set(
    items
      .map((item) => String(item?.item?.commodity || '').toLowerCase())
      .filter(Boolean)
  );

  return commoditySet.size;
};

const inferStagedTotesFromStatus = (backendStatus, totalTotes) => {
  if (totalTotes <= 0) {
    return 0;
  }

  if ([
    'staged',
    'staging_complete',
    'ready',
    'ready_for_pickup',
    'dispensing',
    'dispensing_in_progress',
    'completed',
    'complete',
    'order_complete'
  ].includes(backendStatus)) {
    return totalTotes;
  }

  if (backendStatus === 'staging') {
    return 1;
  }

  return 0;
};

export const deriveCustomerOrderStatus = (order, options = {}) => {
  const backendStatus = String(order?.status || '').toLowerCase();
  const isCanceledStatus = ['cancelled', 'canceled', 'order_canceled'].includes(backendStatus);
  const isCompletedStatus = ['completed', 'complete', 'order_complete'].includes(backendStatus);
  const isDispensingStatus = ['dispensing', 'dispensing_in_progress'].includes(backendStatus);
  const isReadyStatus = ['ready', 'ready_for_pickup'].includes(backendStatus);
  const isStagingStatus = ['staging', 'staged', 'staging_in_progress', 'staging_complete'].includes(backendStatus);
  const isExplicitStagingInProgressStatus = ['staging', 'staging_in_progress'].includes(backendStatus);
  const isPickingCompleteStatus = ['picked', 'picking_complete'].includes(backendStatus);
  const isPickingInProgressStatus = ['picking', 'picking_in_progress'].includes(backendStatus);
  const now = options.now ? new Date(options.now) : new Date();
  const scheduledPickupTime = order?.scheduledPickupTime ? new Date(order.scheduledPickupTime) : null;
  const hasReachedTimeslot = Boolean(scheduledPickupTime && !Number.isNaN(scheduledPickupTime.getTime()) && now >= scheduledPickupTime);
  const stagedToteCountByOrderId = options.stagedToteCountByOrderId;
  const totalTotes = getOrderToteCount(order);
  const stagedTotesFromOrder = toNumber(order?.stagedToteCount);
  const stagedTotesFromMap = stagedToteCountByOrderId?.get?.(toNumber(order?.id));
  const stagedTotes = Math.max(
    0,
    toNumber(
      stagedTotesFromMap !== undefined
        ? stagedTotesFromMap
        : (stagedTotesFromOrder > 0 ? stagedTotesFromOrder : inferStagedTotesFromStatus(backendStatus, totalTotes))
    )
  );
  const allTotesStaged = totalTotes > 0 && stagedTotes >= totalTotes;
  const hasSomeStagedTotes = stagedTotes > 0;

  if (isCanceledStatus) {
    return CUSTOMER_ORDER_PHASE.ORDER_CANCELED;
  }

  if (isCompletedStatus) {
    return CUSTOMER_ORDER_PHASE.ORDER_COMPLETE;
  }

  const hasParkingAssignment = Boolean(String(order?.parkingSpot || '').trim());
  const isCheckedIn = Boolean(order?.isCheckedIn);
  if (isDispensingStatus || (isCheckedIn && hasParkingAssignment)) {
    return CUSTOMER_ORDER_PHASE.DISPENSING_IN_PROGRESS;
  }

  if (isReadyStatus) {
    return hasReachedTimeslot ? CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP : CUSTOMER_ORDER_PHASE.STAGING_COMPLETE;
  }

  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const lineItemStates = orderItems.map(getLineItemState);
  const hasInProgressOrResolvedItem = lineItemStates.some((state) => state === 'in_progress' || state === 'resolved');
  const allItemsResolved = orderItems.length > 0 && lineItemStates.every((state) => state === 'resolved');
  const hasPickingVsStagingConflict = hasInProgressOrResolvedItem
    && !allItemsResolved
    && (hasSomeStagedTotes || isStagingStatus || isExplicitStagingInProgressStatus);

  if (hasPickingVsStagingConflict && !(allTotesStaged && hasReachedTimeslot)) {
    return CUSTOMER_ORDER_PHASE.PICKING_IN_PROGRESS;
  }

  if (allTotesStaged && hasReachedTimeslot) {
    return CUSTOMER_ORDER_PHASE.READY_FOR_PICKUP;
  }

  if (allTotesStaged) {
    return CUSTOMER_ORDER_PHASE.STAGING_COMPLETE;
  }

  if (hasSomeStagedTotes || isStagingStatus || isExplicitStagingInProgressStatus) {
    // Picking in progress should overrule staging in progress when both conditions are true.
    if (hasInProgressOrResolvedItem && !allItemsResolved) {
      return CUSTOMER_ORDER_PHASE.PICKING_IN_PROGRESS;
    }

    return CUSTOMER_ORDER_PHASE.STAGING_IN_PROGRESS;
  }

  if (allItemsResolved || isPickingCompleteStatus) {
    return CUSTOMER_ORDER_PHASE.PICKING_COMPLETE;
  }

  if (hasInProgressOrResolvedItem || isPickingInProgressStatus) {
    return CUSTOMER_ORDER_PHASE.PICKING_IN_PROGRESS;
  }

  return CUSTOMER_ORDER_PHASE.ORDER_PLACED;
};

export const isCustomerOrderActive = (order, options = {}) => {
  const phase = deriveCustomerOrderStatus(order, options);
  const backendStatus = String(order?.status || '').toLowerCase();

  if (TERMINAL_BACKEND_STATUSES.has(backendStatus)) {
    return false;
  }

  return phase !== CUSTOMER_ORDER_PHASE.ORDER_COMPLETE && phase !== CUSTOMER_ORDER_PHASE.ORDER_CANCELED;
};