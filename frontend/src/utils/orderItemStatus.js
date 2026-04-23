const getCanceledLabel = (canceledQuantity, orderedQuantity) => {
  const canceled = Math.max(0, Number(canceledQuantity || 0));
  const ordered = Math.max(0, Number(orderedQuantity || 0));

  if (canceled <= 0) {
    return '';
  }

  if (ordered > 0 && canceled >= ordered) {
    return 'Canceled';
  }

  return `${canceled} of ${ordered} Canceled`;
};

export const getOrderItemStatus = (orderItem, options = {}) => {
  const orderedQuantity = Number(orderItem?.quantity || 0);
  const pickedQuantity = Math.max(0, Number(orderItem?.pickedQuantity || 0));
  const normalizedStatus = String(orderItem?.status || '').toLowerCase();
  const isOrderComplete = Boolean(options?.isOrderComplete);
  const canceledQuantity = Math.max(0, orderedQuantity - pickedQuantity);

  if (normalizedStatus === 'out_of_stock') {
    return { label: 'Not Found', kind: 'not-found' };
  }

  if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') {
    return { label: 'Canceled', kind: 'canceled' };
  }

  if (isOrderComplete && canceledQuantity > 0 && normalizedStatus !== 'out_of_stock') {
    return { label: getCanceledLabel(canceledQuantity, orderedQuantity), kind: 'canceled' };
  }

  if (normalizedStatus === 'found' || pickedQuantity >= orderedQuantity) {
    return { label: 'Picked', kind: 'picked' };
  }

  if (normalizedStatus === 'substituted') {
    return { label: 'Not Found', kind: 'not-found' };
  }

  if (pickedQuantity > 0 && pickedQuantity < orderedQuantity) {
    return { label: `${pickedQuantity} of ${orderedQuantity} Picked`, kind: 'partial' };
  }

  if (normalizedStatus === 'out_of_stock' || normalizedStatus === 'skipped') {
    return { label: 'Not Found', kind: 'not-found' };
  }

  return { label: 'Not Yet Picked', kind: 'pending' };
};
