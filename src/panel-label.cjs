function updateLabelComponents(rows, label) {
  if (!label?.trim()) throw new Error('Menu text cannot be empty.');
  let found = false;
  const result = rows.map(row => {
    const data = structuredClone(typeof row.toJSON === 'function' ? row.toJSON() : row);
    for (const component of data.components || []) {
      if (component.type === 3 && component.custom_id === 'kategori_secim') {
        if (label.length > 150) throw new Error('Menu text cannot exceed 150 characters.');
        component.placeholder = label;
        found = true;
      }
      if (component.type === 2 && component.custom_id === 'tic') {
        if (label.length > 80) throw new Error('Button text cannot exceed 80 characters.');
        component.label = label;
        found = true;
      }
    }
    return data;
  });
  if (!found) throw new Error('No ticket menu or button was found in the saved message.');
  return result;
}
module.exports = { updateLabelComponents };
