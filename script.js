const $ = (id) => document.getElementById(id);
const form = $('productForm');

function show(el, data) { el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2); }
function showError(el, err) { show(el, 'ERROR: ' + err.message + (Object.keys(err.details || {}).length ? '\n' + JSON.stringify(err.details, null, 2) : '')); }

async function loadStall() {
  const s = await WasteLessAPI.getStall();
  $('stall').textContent = `#${s.stall_id} ${s.stall_name}`;
  $('summary').textContent = `Products listed: ${s.summary.products_listed} | Low-stock: ${s.summary.low_stock_items} | Plastic items sold this week: ${s.summary.plastic_items_sold_this_week}`;
}

async function loadCategories() {
  const cats = await WasteLessAPI.getCategories();
  cats.forEach((c) => {
    $('filterCat').add(new Option(c.category_name));
    $('formCat').add(new Option(c.category_name));
  });
}

async function loadProducts() {
  const data = await WasteLessAPI.getProducts({ q: $('q').value, category: $('filterCat').value });
  $('count').textContent = data.count;
  $('rows').innerHTML = '';
  data.products.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.product_id}</td><td>${p.stall_id}</td><td></td><td></td><td>${p.category_name}</td>
      <td>${p.packaging_type}</td><td>₱${p.unit_price.toFixed(2)}</td><td>${p.stock}${p.is_low_stock ? ' (low)' : ''}</td>
      <td>${p.image_url ? `<img src="${p.image_url}" width="40">` : ''}</td>
      <td><button data-edit>Edit</button> <button data-del>Delete</button></td>`;
    tr.children[2].textContent = p.stall_name;    // textContent = safe from HTML injection
    tr.children[3].textContent = p.product_name;
    tr.querySelector('[data-edit]').onclick = () => startEdit(p.product_id);
    tr.querySelector('[data-del]').onclick = async () => {
      if (!confirm(`Delete ${p.product_name}?`)) return;
      await WasteLessAPI.deleteProduct(p.product_id);
      loadProducts(); loadStall();
    };
    $('rows').appendChild(tr);
  });
}

async function startEdit(id) {
  const p = await WasteLessAPI.getProduct(id);
  form.product_id.value = p.product_id;
  form.product_name.value = p.product_name;
  form.description.value = p.description || '';
  form.category.value = p.category_name;
  form.packaging_type.value = p.packaging_type;
  form.unit_price.value = p.unit_price;
  form.stock.value = p.stock;
  $('formTitle').textContent = 'Edit Product';
  $('saveBtn').textContent = 'Save Changes';
}

function resetForm() {
  form.reset();
  form.product_id.value = '';
  $('formTitle').textContent = 'Add Product';
  $('saveBtn').textContent = 'Save Product';
}

form.onsubmit = async (e) => {
  e.preventDefault();
  const id = form.product_id.value;
  const fd = new FormData(form);
  fd.delete('product_id');
  if (!fd.get('image') || !fd.get('image').size) fd.delete('image');
  try {
    const saved = id ? await WasteLessAPI.editProduct(id, fd) : await WasteLessAPI.addProduct(fd);
    show($('productMsg'), saved);
    resetForm();
    loadProducts(); loadStall();
  } catch (err) { showError($('productMsg'), err); }
};
$('cancelEdit').onclick = resetForm;
$('refresh').onclick = loadProducts;
$('q').oninput = loadProducts;
$('filterCat').onchange = loadProducts;

async function loadSubs() {
  const data = await WasteLessAPI.getSubmissions();
  $('subs').innerHTML = '';
  data.submissions.forEach((m) => {
    const li = document.createElement('li');
    li.textContent = `[${m.status}] ${m.feedback_type}: ${m.subject} — ${new Date(m.created_at).toLocaleString()}`;
    $('subs').appendChild(li);
  });
}
$('feedbackForm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (!fd.get('attachment') || !fd.get('attachment').size) fd.delete('attachment');
  try {
    show($('feedbackMsg'), await WasteLessAPI.sendFeedback(fd));
    e.target.reset();
    loadSubs();
  } catch (err) { showError($('feedbackMsg'), err); }
};

loadStall(); loadCategories().then(loadProducts); loadSubs();
