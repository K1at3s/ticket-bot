function updateLabelComponents(rows, label) {
  if (!label?.trim()) throw new Error('Menü yazısı boş olamaz.');
  let found = false;
  const result = rows.map(row => {
    const data = structuredClone(typeof row.toJSON === 'function' ? row.toJSON() : row);
    for (const component of data.components || []) {
      if (component.type === 3 && component.custom_id === 'kategori_secim') {
        if (label.length > 150) throw new Error('Menü yazısı en fazla 150 karakter olabilir.');
        component.placeholder = label;
        found = true;
      }
      if (component.type === 2 && component.custom_id === 'tic') {
        if (label.length > 80) throw new Error('Buton yazısı en fazla 80 karakter olabilir.');
        component.label = label;
        found = true;
      }
    }
    return data;
  });
  if (!found) throw new Error('Kayıtlı mesajda ticket menüsü veya butonu bulunamadı.');
  return result;
}
module.exports = { updateLabelComponents };
