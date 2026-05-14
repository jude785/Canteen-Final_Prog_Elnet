(() => {
  const appRoot = document.getElementById("ecanteen-app");

  if (!appRoot) {
    return;
  }

  const state = {
    screen: "landing",
    categories: [],
    products: [],
    orders: [],
    employees: [],
    selectedCategory: 1,
    cart: [],
    currentOrder: null,
    paymentMethod: null,
    cashAmount: "",
    gcashReference: "",
    paymentError: "",
    isVerifying: false,
    loginOpen: false,
    loginStep: "scan",
    scannedQR: "",
    pin: "",
    loginError: "",
    scannedEmployee: null,
    loggedInEmployee: null,
    filter: "all",
    orderSearch: "",
    menuSearch: "",
    staffSection: "dashboard",
    showEmployeeManagement: false,
    showAddEmployee: false,
    employeeForm: { name: "", pin: "", role: "cashier" },
    employeeError: "",
    qrEmployeeCode: null,
    scannerActive: false,
    scannerError: "",
    scannerStream: null,
    appError: "",
    loading: true
  };

  function peso(value) {
    return `P${Number(value).toFixed(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof payload === "string"
        ? payload
        : payload.message || "Request failed.";
      throw new Error(message);
    }

    return payload;
  }

  function totalAmount() {
    return state.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }

  function cartCount() {
    return state.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function getCartItem(productId) {
    return state.cart.find(item => item.product.id === productId);
  }

  function getEmployeeByQr(qrCode) {
    return state.employees.find(item => item.qrCode === qrCode);
  }

  function statusMeta(status) {
    switch (status) {
      case "pending":
        return { icon: "!", title: "Payment Pending", message: "Waiting for payment confirmation", iconClass: "pending" };
      case "paid":
        return { icon: "OK", title: "Payment Confirmed", message: "Your order has been accepted", iconClass: "paid" };
      case "preparing":
        return { icon: "Chef", title: "Preparing Your Order", message: "Our team is preparing your food", iconClass: "preparing" };
      case "completed":
        return { icon: "Ready", title: "Order Ready!", message: "Please collect your order at the counter", iconClass: "completed" };
      case "cancelled":
        return { icon: "X", title: "Order Cancelled", message: "This order has been cancelled", iconClass: "cancelled" };
      default:
        return { icon: "...", title: "Order Placed", message: "Processing your order", iconClass: "pending" };
    }
  }

  function getCategoryLabel(categoryId) {
    return state.categories.find(item => item.id === categoryId)?.name || "Items";
  }

  function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function getVisibleOrders() {
    const byStatus = state.filter === "all"
      ? state.orders
      : state.orders.filter(order => order.status === state.filter);

    const search = normalize(state.orderSearch);
    const filtered = !search
      ? byStatus
      : byStatus.filter(order =>
          normalize(order.orderNumber).includes(search) ||
          normalize(order.paymentMethod).includes(search) ||
          normalize(order.referenceNumber).includes(search) ||
          order.items.some(item => normalize(item.productName).includes(search))
        );

    const rank = { pending: 0, paid: 1, preparing: 2, completed: 3, cancelled: 4 };
    return [...filtered].sort((left, right) => {
      const statusDiff = (rank[left.status] ?? 99) - (rank[right.status] ?? 99);
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
  }

  function getOrderMetrics() {
    const pending = state.orders.filter(order => order.status === "pending").length;
    const paid = state.orders.filter(order => order.status === "paid").length;
    const preparing = state.orders.filter(order => order.status === "preparing").length;
    const completedToday = state.orders.filter(order =>
      order.status === "completed" &&
      new Date(order.createdAt).toDateString() === new Date().toDateString()
    ).length;

    return { pending, paid, preparing, completedToday };
  }

  function resetPaymentState() {
    state.paymentMethod = null;
    state.cashAmount = "";
    state.gcashReference = "";
    state.paymentError = "";
    state.isVerifying = false;
  }

  function stopScanner() {
    if (state.scannerStream) {
      state.scannerStream.getTracks().forEach(track => track.stop());
    }
    state.scannerActive = false;
    state.scannerStream = null;
  }

  async function startScanner() {
    state.scannerError = "";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      state.scannerError = "Camera scanning is not supported in this browser. Use manual QR code entry below.";
      render();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      state.scannerStream = stream;
      state.scannerActive = true;
      render();
      const video = document.getElementById("scanner-video");
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
    } catch {
      state.scannerError = "Unable to access the camera. Use manual QR code entry below.";
      state.scannerActive = false;
      render();
    }
  }

  async function loadBootstrapData() {
    state.loading = true;
    state.appError = "";
    render();

    try {
      // Load the menu, orders, and staff from the server-backed database
      // instead of keeping them only in browser local storage.
      const [categories, products, orders, employees] = await Promise.all([
        fetchJson("/api/catalog/categories"),
        fetchJson("/api/catalog/products"),
        fetchJson("/api/orders"),
        fetchJson("/api/staff/employees")
      ]);

      state.categories = categories;
      state.products = products;
      state.orders = orders;
      state.employees = employees;

      if (state.currentOrder) {
        state.currentOrder = state.orders.find(item => item.id === state.currentOrder.id) || null;
      }
    } catch (error) {
      state.appError = error.message || "Unable to load the app data.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function refreshOrders() {
    state.orders = await fetchJson("/api/orders");
    if (state.currentOrder) {
      state.currentOrder = state.orders.find(item => item.id === state.currentOrder.id) || null;
    }
  }

  async function refreshEmployees() {
    state.employees = await fetchJson("/api/staff/employees");
    if (state.loggedInEmployee) {
      state.loggedInEmployee = state.employees.find(item => item.id === state.loggedInEmployee.id) || null;
    }
  }

  function addToCart(productId) {
    const product = state.products.find(item => item.id === productId);
    if (!product || product.stock === 0) {
      return;
    }

    const existing = getCartItem(productId);
    if (existing) {
      if (existing.quantity < product.stock) {
        existing.quantity += 1;
      }
    } else {
      state.cart.push({ product, quantity: 1 });
    }
    render();
  }

  function updateQuantity(productId, nextQuantity) {
    const current = getCartItem(productId);
    if (!current) {
      return;
    }

    if (nextQuantity <= 0) {
      state.cart = state.cart.filter(item => item.product.id !== productId);
      render();
      return;
    }

    if (nextQuantity > current.product.stock) {
      return;
    }

    current.quantity = nextQuantity;
    render();
  }

  async function placeOrder(paymentMethod, paymentData = {}) {
    try {
      // Orders are now persisted through the backend so they survive refreshes
      // and can be shared across cashier and student sessions.
      const order = await fetchJson("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          referenceNumber: paymentData.referenceNumber,
          amountReceived: paymentData.amountReceived,
          items: state.cart.map(item => ({
            productId: item.product.id,
            quantity: item.quantity
          }))
        })
      });

      state.currentOrder = order;
      state.cart = [];
      state.screen = "status";
      resetPaymentState();

      await loadBootstrapData();
    } catch (error) {
      state.paymentError = error.message || "Unable to place the order.";
      render();
    }
  }

  async function submitManualQr() {
    state.loginError = "";
    const employee = getEmployeeByQr(state.scannedQR.trim().toUpperCase());
    if (!employee) {
      state.loginError = "Invalid employee QR code";
      render();
      return;
    }

    state.scannedEmployee = employee;
    state.scannedQR = employee.qrCode;
    state.loginStep = "pin";
    render();
  }

  async function submitPin() {
    state.loginError = "";
    if (!state.scannedEmployee) {
      state.loginError = "No employee scanned";
      render();
      return;
    }

    try {
      const employee = await fetchJson("/api/staff/login", {
        method: "POST",
        body: JSON.stringify({
          qrCode: state.scannedEmployee.qrCode,
          pin: state.pin
        })
      });

      stopScanner();
      state.loggedInEmployee = employee;
      state.loginOpen = false;
      state.loginStep = "scan";
      state.scannedEmployee = null;
      state.pin = "";
      state.scannedQR = "";
      state.loginError = "";
      state.showEmployeeManagement = false;
      state.staffSection = "dashboard";
      await refreshOrders();
      await refreshEmployees();
      render();
    } catch (error) {
      state.loginError = error.message || "Incorrect PIN";
      state.pin = "";
      render();
    }
  }

  async function addEmployee() {
    state.employeeError = "";
    const name = state.employeeForm.name.trim();
    const pin = state.employeeForm.pin.trim();

    if (!name || !pin) {
      state.employeeError = "Please fill in all fields";
      render();
      return;
    }

    if (pin.length < 4) {
      state.employeeError = "PIN must be at least 4 digits";
      render();
      return;
    }

    try {
      const employee = await fetchJson("/api/staff/employees", {
        method: "POST",
        body: JSON.stringify({
          actorEmployeeId: state.loggedInEmployee.id,
          name,
          pin,
          role: state.employeeForm.role
        })
      });

      state.showAddEmployee = false;
      state.employeeForm = { name: "", pin: "", role: "cashier" };
      state.qrEmployeeCode = employee.qrCode;
      await refreshEmployees();
      render();
    } catch (error) {
      state.employeeError = error.message || "Unable to add employee.";
      render();
    }
  }

  async function deleteEmployee(id) {
    if (!state.loggedInEmployee || id === state.loggedInEmployee.id) {
      return;
    }

    try {
      await fetchJson(`/api/staff/employees/${id}?actorEmployeeId=${state.loggedInEmployee.id}`, {
        method: "DELETE"
      });
      await refreshEmployees();
      render();
    } catch (error) {
      state.employeeError = error.message || "Unable to delete employee.";
      render();
    }
  }

  async function updateOrderStatus(id, nextStatus) {
    try {
      const updated = await fetchJson(`/api/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          actorEmployeeId: state.loggedInEmployee.id,
          status: nextStatus
        })
      });

      state.orders = state.orders.map(order => order.id === id ? updated : order);
      if (state.currentOrder && state.currentOrder.id === id) {
        state.currentOrder = updated;
      }

      await loadBootstrapData();
    } catch (error) {
      state.appError = error.message || "Unable to update the order.";
      render();
    }
  }

  function downloadEmployeeQr() {
    const canvas = document.getElementById("employee-qr-canvas");
    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = `employee-qr-${state.qrEmployeeCode}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }

  function printEmployeeQr() {
    const canvas = document.getElementById("employee-qr-canvas");
    const employee = state.employees.find(item => item.qrCode === state.qrEmployeeCode);
    if (!canvas || !employee) {
      return;
    }

    const newWindow = window.open("", "_blank");
    if (!newWindow) {
      return;
    }

    newWindow.document.write(`
      <html>
      <head>
        <title>Employee QR Code - ${escapeHtml(employee.name)}</title>
        <style>
          body { font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
          .wrap { text-align:center; border:2px solid #000; padding:24px; }
          img { max-width:300px; display:block; margin:16px auto; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>E-Canteen Staff ID</h1>
          <h2>${escapeHtml(employee.name)}</h2>
          <img src="${canvas.toDataURL()}" alt="QR Code" />
          <div>${escapeHtml(employee.qrCode)}</div>
        </div>
      </body>
      </html>
    `);
    newWindow.document.close();
    newWindow.print();
  }

  function renderLoading() {
    return `
      <section class="screen narrow">
        <div class="status-card">
          <h2 class="section-title">Loading E-Canteen</h2>
          <p class="meta">Preparing menu, orders, and staff data.</p>
        </div>
      </section>
    `;
  }

  function renderBanner() {
    return state.appError
      ? `<div class="screen"><div class="error-box">${escapeHtml(state.appError)}</div></div>`
      : "";
  }

  function renderBrand() {
    return `
      <div class="brand-mark">
        <span><strong>QU!CK</strong>SERVE</span>
        <span class="brand-cloche" aria-hidden="true"></span>
      </div>
    `;
  }

  function renderStudentHeader() {
    if (state.screen !== "landing") {
      return "";
    }

    return `
      <header class="student-header ${state.screen === "landing" ? "hero-header" : ""}">
        ${renderBrand()}
      </header>
    `;
  }

  function renderLandingScreen() {
    return `
      <section class="landing-screen">
        <div class="landing-copy">
          <h1>Order Your Favorite<br />Food Easily</h1>
          <p>A smarter way to satisfy your cravings. Order in just a few taps and have your food prepared fresh and ready on time.</p>
          <button class="btn-main landing-cta" data-action="start-order">ORDER HERE &rarr;</button>
        </div>
        <div class="landing-art" aria-hidden="true">
          <div class="hero-disc"></div>
          <div class="bubble bubble-one"></div>
          <div class="bubble bubble-two"></div>
          <div class="bubble bubble-three"></div>
          <img class="hero-burger" src="/images/image 2 (1).png" alt="" />
          <img class="hero-drink" src="/images/image 3.png" alt="" />
          <img class="hero-fries" src="/images/1 1.png" alt="" />
        </div>
        <button class="landing-login" data-action="open-login">LOG IN</button>
      </section>
    `;
  }

  function renderMenuScreen() {
    const byCategory = state.selectedCategory === 1
      ? state.products
      : state.products.filter(product => product.categoryId === state.selectedCategory);
    const search = normalize(state.menuSearch);
    const filtered = search
      ? byCategory.filter(product =>
          normalize(product.name).includes(search) ||
          normalize(getCategoryLabel(product.categoryId)).includes(search)
        )
      : byCategory;

    return `
      <section class="quick-layout">
        <aside class="quick-sidebar">
          ${renderBrand()}
          <nav class="quick-nav">
            ${state.categories.map(category => `
              <button class="side-tab ${state.selectedCategory === category.id ? "active" : ""}" data-action="set-category" data-id="${category.id}">
                ${escapeHtml(category.name)}
              </button>
            `).join("")}
          </nav>
          <button class="sidebar-back" data-action="back-landing">&larr; Back</button>
        </aside>
        <main class="quick-main">
          <div class="menu-toolbar">
            <div class="menu-title">
              <span>MENU</span>
              <span aria-hidden="true">⌄</span>
            </div>
            <label class="search-box">
              <span aria-hidden="true"></span>
              <input name="menuSearch" type="search" placeholder="Search foods here..." value="${escapeHtml(state.menuSearch)}" />
            </label>
            <button class="cart-button" data-action="goto-cart">
              <span class="cart-icon">cart</span>
              <span>ORDER NOW &rarr;</span>
              ${cartCount() > 0 ? `<span class="cart-count">${cartCount()}</span>` : ""}
            </button>
          </div>
          <div class="product-grid">
            ${filtered.map(product => {
              const inCart = getCartItem(product.id)?.quantity || 0;
              const available = product.stock > 0;
              return `
                <article class="quick-product">
                  <img class="quick-product-image" src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />
                  ${inCart > 0 && available ? `<div class="badge-cart">${inCart}</div>` : ""}
                  <div class="quick-product-info">
                    <h3>${escapeHtml(product.name)}</h3>
                    <strong>${peso(product.price)}</strong>
                  </div>
                  <div class="availability ${available ? "yes" : "no"}">${available ? "Available" : "Not Available"}</div>
                  <button class="btn-main add-cart-btn" data-action="add-cart" data-id="${product.id}" ${available ? "" : "disabled"}>
                    ADD TO CART
                  </button>
                </article>
              `;
            }).join("")}
            ${!filtered.length ? `
              <div class="empty-card">
                <h2 class="section-title">No menu items found</h2>
                <p class="meta">Try another category or search term.</p>
              </div>
            ` : ""}
          </div>
        </main>
      </section>
    `;
  }

  function renderCartScreen() {
    const subtotal = totalAmount();
    const tax = subtotal * 0.12 / 1.12;

    if (!state.cart.length) {
      return `
        <section class="cart-page">
          <div class="menu-toolbar cart-toolbar">
            <div class="menu-title">Order <span aria-hidden="true">⌄</span></div>
            <label class="search-box">
              <span aria-hidden="true"></span>
              <input name="menuSearch" type="search" placeholder="Search your foods..." value="${escapeHtml(state.menuSearch)}" />
            </label>
            <button class="sidebar-back" data-action="goto-menu">&larr; Back</button>
          </div>
          <div class="empty-card">
            <h2 class="section-title">Your cart is empty</h2>
            <p class="meta">Add items from the menu before checkout.</p>
            <button class="btn-main" data-action="goto-menu">Browse Menu</button>
          </div>
        </section>
      `;
    }

    return `
      <section class="cart-page">
        <div class="menu-toolbar cart-toolbar">
          <div class="menu-title">Order <span aria-hidden="true">⌄</span></div>
          <label class="search-box">
            <span aria-hidden="true"></span>
            <input name="menuSearch" type="search" placeholder="Search your foods..." value="${escapeHtml(state.menuSearch)}" />
          </label>
          <button class="sidebar-back" data-action="goto-menu">&larr; Back</button>
        </div>
        <div class="cart-heading">
          <h2>Your Cart</h2>
          <button class="outline-pill" type="button">Add-Ons +</button>
        </div>
        <div class="cart-layout">
          <div class="cart-list-panel">
            ${state.cart.map(item => `
              <article class="cart-line">
                <img class="cart-thumb" src="${escapeHtml(item.product.imageUrl)}" alt="${escapeHtml(item.product.name)}" />
                <div class="cart-line-copy">
                  <h3>${escapeHtml(item.product.name)}</h3>
                  <strong>Price: ${peso(item.product.price)}</strong>
                </div>
                <div class="cart-line-actions">
                  <span>Quantity:</span>
                  <div class="qty-stepper">
                    <button data-action="decrease-cart" data-id="${item.product.id}">-</button>
                    <strong>${item.quantity}</strong>
                    <button data-action="increase-cart" data-id="${item.product.id}" ${item.quantity >= item.product.stock ? "disabled" : ""}>+</button>
                  </div>
                  <div class="cart-mini-actions">
                    <button class="customize-btn" type="button">Customize</button>
                    <button class="delete-btn" data-action="remove-cart" data-id="${item.product.id}">Delete</button>
                  </div>
                </div>
              </article>
            `).join("")}
          </div>
          <aside class="order-summary-panel">
            <h2>Your Order</h2>
            <div class="summary-row"><span>Item(s):</span><strong>${cartCount()}</strong></div>
            <div class="summary-row"><span>Order Type:</span><strong>DINE-IN⌄</strong></div>
            <hr />
            <div class="summary-row"><span>Subtotal:</span><strong>${peso(subtotal - tax)}</strong></div>
            <div class="summary-row"><span>Tax:</span><strong>${peso(tax)}</strong></div>
            <div class="summary-row total"><span>Total Amount:</span><strong>${peso(subtotal)}</strong></div>
            <button class="btn-main checkout-primary" data-action="goto-checkout">Proceed to Checkout</button>
            <p class="meta">Other Payment Methods:</p>
            <button class="payment-chip" data-action="select-payment" data-method="gcash">Gcash Payment</button>
          </aside>
        </div>
      </section>
    `;
  }

  function renderCheckoutScreen() {
    if (state.paymentMethod === "cash") {
      const received = parseFloat(state.cashAmount);
      const change = received - totalAmount();
      return `
        <section class="screen narrow">
          <button class="btn-light" data-action="back-payment">Back</button>
          <div class="status-card" style="margin-top:1rem; text-align:left">
            <div class="status-icon paid" style="margin-left:auto; margin-right:auto">Cash</div>
            <h2 class="section-title" style="text-align:center">Cash Payment</h2>
            <p class="meta" style="text-align:center">Enter the amount received from customer.</p>
            <div class="status-block">
              <div class="line-row">
                <span class="section-title" style="margin:0">Total Amount:</span>
                <span class="price">${peso(totalAmount())}</span>
              </div>
            </div>
            <label class="section-title" style="font-size:1rem">Amount Received</label>
            <input class="input" name="cashAmount" type="number" min="0" step="0.01" placeholder="0.00" value="${escapeHtml(state.cashAmount)}" />
            ${state.paymentError ? `<p class="error-text" style="margin-top:0.5rem">${escapeHtml(state.paymentError)}</p>` : ""}
            ${!Number.isNaN(change) && state.cashAmount && change >= 0 ? `<div class="success-box" style="margin-top:1rem">Change: ${peso(change)}</div>` : ""}
            <button class="btn-main" style="margin-top:1rem" data-action="confirm-cash">Confirm Payment</button>
          </div>
        </section>
      `;
    }

    if (state.paymentMethod === "gcash") {
      return `
        <section class="screen narrow">
          <button class="btn-light" data-action="back-payment">Back</button>
          <div class="status-card" style="margin-top:1rem; text-align:left">
            <div class="status-icon preparing" style="margin-left:auto; margin-right:auto">GC</div>
            <h2 class="section-title" style="text-align:center">GCash Payment</h2>
            <p class="meta" style="text-align:center">Scan QR code or send to GCash number.</p>
            <div class="status-block">
              <div class="line-row">
                <span class="section-title" style="margin:0">Amount to Pay:</span>
                <span class="price" style="color:#2563eb">${peso(totalAmount())}</span>
              </div>
            </div>
            <div class="qr-box info-box">
              <div style="background:#fff; border-radius:12px; padding:1rem; margin-bottom:0.75rem">
                <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; border-radius:12px; padding:2rem 1rem; font-weight:700">
                  QR CODE<br />Scan with GCash App
                </div>
              </div>
              GCash Number: <strong>0917-123-4567</strong>
            </div>
            <label class="section-title" style="font-size:1rem">Enter Reference Number</label>
            <input class="input blue" name="gcashReference" type="text" placeholder="e.g. 1234567890123" value="${escapeHtml(state.gcashReference)}" />
            ${state.paymentError ? `<p class="error-text" style="margin-top:0.5rem">${escapeHtml(state.paymentError)}</p>` : ""}
            <p class="helper" style="margin-top:0.5rem">Found in your GCash transaction history.</p>
            <button class="btn-main" style="margin-top:1rem; background:#2563eb" data-action="confirm-gcash" ${state.isVerifying ? "disabled" : ""}>
              ${state.isVerifying ? "Verifying Payment..." : "Confirm Payment"}
            </button>
          </div>
        </section>
      `;
    }

    return `
      <section class="screen narrow">
        <button class="btn-light" data-action="goto-cart">Back to Cart</button>
        <div class="status-card" style="margin-top:1rem; text-align:left">
          <h2 class="section-title">Checkout</h2>
          <p class="meta">Select your payment method.</p>
          <div class="summary-card" style="margin:1rem 0">
            <div class="line-row">
              <span class="section-title" style="margin:0">Total Amount:</span>
              <span class="price">${peso(totalAmount())}</span>
            </div>
          </div>
          <div class="list-stack">
            <button class="payment-card cash" data-action="select-payment" data-method="cash">
              <div class="order-header">
                <div>
                  <h3>Cash Payment</h3>
                  <p class="meta">Pay with physical cash at the counter.</p>
                </div>
                <strong style="color:#16a34a">></strong>
              </div>
            </button>
            <button class="payment-card gcash" data-action="select-payment" data-method="gcash">
              <div class="order-header">
                <div>
                  <h3>GCash Payment</h3>
                  <p class="meta">Pay instantly via GCash mobile wallet.</p>
                </div>
                <strong style="color:#2563eb">></strong>
              </div>
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function renderStatusScreen() {
    if (!state.currentOrder) {
      state.screen = "menu";
      return renderMenuScreen();
    }

    const meta = statusMeta(state.currentOrder.status);
    return `
      <section class="screen narrow">
        <div class="status-card">
          <div class="status-icon ${meta.iconClass}">${meta.icon}</div>
          <h2 class="section-title">${meta.title}</h2>
          <p class="meta">${meta.message}</p>
          <div class="summary-card" style="margin-top:1rem; text-align:left">
            <div class="order-header">
              <div>
                <div class="meta">Order Number</div>
                <div class="section-title" style="margin:0">${escapeHtml(state.currentOrder.orderNumber)}</div>
              </div>
              <span class="status-pill ${state.currentOrder.status}">${escapeHtml(state.currentOrder.status)}</span>
            </div>
            <div class="order-items">
              ${state.currentOrder.items.map(item => `
                <div class="line-row" style="margin-bottom:0.5rem">
                  <span>${item.quantity}x ${escapeHtml(item.productName)}</span>
                  <strong>${peso(item.price * item.quantity)}</strong>
                </div>
              `).join("")}
            </div>
            <div class="line-row">
              <span class="section-title" style="margin:0">Total Amount:</span>
              <span class="price">${peso(state.currentOrder.totalAmount)}</span>
            </div>
            <div class="line-row meta" style="margin-top:0.5rem">
              <span>Payment Method:</span>
              <strong>${escapeHtml(state.currentOrder.paymentMethod.toUpperCase())}</strong>
            </div>
            ${state.currentOrder.paymentMethod === "cash" && state.currentOrder.amountReceived ? `
              <div class="line-row meta" style="margin-top:0.5rem">
                <span>Amount Received:</span>
                <strong>${peso(state.currentOrder.amountReceived)}</strong>
              </div>
              <div class="line-row meta" style="margin-top:0.5rem">
                <span>Change:</span>
                <strong style="color:#16a34a">${peso(state.currentOrder.change || 0)}</strong>
              </div>
            ` : ""}
            ${state.currentOrder.paymentMethod === "gcash" && state.currentOrder.referenceNumber ? `
              <div class="line-row meta" style="margin-top:0.5rem">
                <span>Reference No:</span>
                <strong>${escapeHtml(state.currentOrder.referenceNumber)}</strong>
              </div>
            ` : ""}
          </div>
          <button class="btn-main" data-action="new-order">Place New Order</button>
        </div>
      </section>
    `;
  }

  function renderStudentView() {
    let content = "";
    if (state.screen === "landing") content = renderLandingScreen();
    if (state.screen !== "landing" && state.loading) content = renderLoading();
    if (!state.loading && state.screen === "menu") content = renderMenuScreen();
    if (!state.loading && state.screen === "cart") content = renderCartScreen();
    if (!state.loading && state.screen === "checkout") content = renderCheckoutScreen();
    if (!state.loading && state.screen === "status") content = renderStatusScreen();

    return `
      <div class="student-shell">
        ${renderStudentHeader()}
        ${renderBanner()}
        ${content}
        ${state.screen !== "landing" ? `<button class="staff-login" data-action="open-login">Staff Login</button>` : ""}
        ${state.loginOpen ? renderLoginModal() : ""}
      </div>
    `;
  }

  function getFilteredCount(status) {
    if (status === "all") {
      return state.orders.length;
    }
    return state.orders.filter(order => order.status === status).length;
  }

  function renderStaffHeader() {
    const employee = state.loggedInEmployee;
    return `
      <header class="admin-topline">
        <div></div>
        <p>Welcome, <span>${escapeHtml(employee.role === "admin" ? "Admin" : employee.name)}</span>!</p>
      </header>
    `;
  }

  function renderStaffSidebar() {
    const items = [
      ["dashboard", "Dashboard"],
      ["menu", "Menu"],
      ["orders", "Orders"],
      ["stock", "Stock"],
      ["report", "Report"]
    ];

    return `
      <aside class="admin-sidebar">
        ${renderBrand()}
        <nav class="quick-nav admin-nav">
          ${items.map(([section, label]) => `
            <button class="side-tab ${state.staffSection === section ? "active" : ""}" data-action="set-staff-section" data-section="${section}">
              ${label}
            </button>
          `).join("")}
          ${state.loggedInEmployee.role === "admin" ? `
            <button class="side-tab ${state.staffSection === "staff" ? "active" : ""}" data-action="set-staff-section" data-section="staff">
              Staff
            </button>
          ` : ""}
        </nav>
        <button class="logout-link" data-action="logout-staff">Log Out</button>
      </aside>
    `;
  }

  function renderDashboard() {
    const visible = getVisibleOrders();
    const metrics = getOrderMetrics();

    if (!visible.length) {
      return `
        <section class="admin-content">
          <div class="admin-hero">
            <h1>Dashboard Overview</h1>
            <p>Real-time status of your canteen operations.</p>
          </div>
          <div class="empty-card">
            <h2 class="section-title">No orders found</h2>
            <p class="meta">Try another status tab or clear your search.</p>
          </div>
        </section>
      `;
    }

    return `
      <section class="admin-content">
        ${renderBanner()}
        <div class="admin-hero">
          <h1>${state.staffSection === "report" ? "Sales Report" : "Dashboard Overview"}</h1>
          <p>${state.staffSection === "report" ? "Daily Performance Report." : "Real-time status of your canteen operations."}</p>
        </div>
        <div class="admin-metrics">
          <article><span>Pending Payments</span><strong>${metrics.pending}</strong><small>needs review</small></article>
          <article><span>Paid Orders</span><strong>${metrics.paid}</strong><small>ready to prepare</small></article>
          <article><span>Preparing</span><strong>${metrics.preparing}</strong><small>in kitchen</small></article>
          <article><span>Completed Today</span><strong>${metrics.completedToday}</strong><small>served orders</small></article>
        </div>
        <div class="admin-filters">
          <input class="input blue dashboard-search" name="orderSearch" type="text" placeholder="Search order no., item, payment, ref..." value="${escapeHtml(state.orderSearch)}" />
          ${["all", "pending", "paid", "preparing", "completed"].map(status => `
            <button class="filter-chip ${state.filter === status ? "active" : ""}" data-action="set-filter" data-status="${status}">
              ${status.charAt(0).toUpperCase() + status.slice(1)} (${getFilteredCount(status)})
            </button>
          `).join("")}
        </div>
        <div class="admin-order-list">
          ${visible.map(order => `
            <article class="order-card card compact-order ${order.status}">
              <div class="order-header">
                <div>
                  <h3 class="order-title">${escapeHtml(order.orderNumber)}</h3>
                  <div class="meta">${new Date(order.createdAt).toLocaleString()}</div>
                </div>
                <div style="text-align:right">
                  <span class="status-pill ${order.status}">${escapeHtml(order.status)}</span>
                  <div class="price" style="margin-top:0.5rem">${peso(order.totalAmount)}</div>
                </div>
              </div>
              <div class="order-meta-row">
                <div class="results-chip subtle">${order.items.length} item${order.items.length === 1 ? "" : "s"}</div>
                <div class="results-chip subtle">Payment: ${escapeHtml(order.paymentMethod.toUpperCase())}</div>
                ${order.referenceNumber ? `<div class="results-chip subtle">Ref: ${escapeHtml(order.referenceNumber)}</div>` : ""}
              </div>
              <div class="status-block">
                <div class="meta" style="margin-bottom:0.5rem; font-weight:700">Items:</div>
                ${order.items.map(item => `
                  <div class="line-row meta" style="margin-bottom:0.35rem">
                    <span>${item.quantity}x ${escapeHtml(item.productName)}</span>
                    <strong>${peso(item.price * item.quantity)}</strong>
                  </div>
                `).join("")}
              </div>
              <div class="toolbar-actions">
                ${order.status === "pending" && order.paymentMethod === "gcash" ? `<button class="btn-main" style="width:auto" data-action="update-order-status" data-id="${order.id}" data-status-value="paid">Confirm Payment</button>` : ""}
                ${order.status === "paid" ? `<button class="btn-secondary" data-action="update-order-status" data-id="${order.id}" data-status-value="preparing">Start Preparing</button>` : ""}
                ${order.status === "preparing" ? `<button class="btn-main" style="width:auto" data-action="update-order-status" data-id="${order.id}" data-status-value="completed">Mark Complete</button>` : ""}
                ${(order.status === "pending" || order.status === "paid") ? `<button class="btn-danger" data-action="update-order-status" data-id="${order.id}" data-status-value="cancelled">Cancel Order</button>` : ""}
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderEmployeeManagement() {
    return `
      <section class="admin-content">
        <div class="admin-hero">
          <h1>Employee Management</h1>
          <p>Create staff accounts and manage QR access.</p>
        </div>
        ${renderBanner()}
        <div style="display:flex; justify-content:flex-end; margin-bottom:1rem">
          <button class="btn-main" style="width:auto; background:#2563eb" data-action="open-add-employee">Add Employee</button>
        </div>
        <div class="employee-grid">
          ${state.employees.map(employee => `
            <article class="employee-card">
              <div class="order-header" style="align-items:flex-start">
                <div style="display:flex; gap:0.75rem; align-items:center">
                  <div class="employee-avatar">${escapeHtml(employee.name.charAt(0))}</div>
                  <div>
                    <h3>${escapeHtml(employee.name)}</h3>
                    <span class="role-tag ${employee.role}">${escapeHtml(employee.role.toUpperCase())}</span>
                  </div>
                </div>
              </div>
              <div class="status-block">
                <div class="meta">QR Code: <strong>${escapeHtml(employee.qrCode)}</strong></div>
                <div class="meta" style="margin-top:0.45rem">Created: ${new Date(employee.createdAt).toLocaleDateString()}</div>
              </div>
              <div class="toolbar-actions">
                <button class="btn-main" style="width:auto" data-action="show-employee-qr" data-code="${escapeHtml(employee.qrCode)}">Show QR</button>
                ${state.loggedInEmployee.id !== employee.id ? `<button class="btn-danger" data-action="delete-employee" data-id="${employee.id}">Delete</button>` : ""}
              </div>
            </article>
          `).join("")}
        </div>
        ${state.showAddEmployee ? renderAddEmployeeModal() : ""}
        ${state.qrEmployeeCode ? renderEmployeeQrModal() : ""}
      </section>
    `;
  }

  function renderStaffView() {
    const content = state.staffSection === "staff"
      ? renderEmployeeManagement()
      : renderDashboard();

    return `
      <div class="admin-shell">
        ${renderStaffSidebar()}
        ${renderStaffHeader()}
        ${content}
      </div>
    `;
  }

  function renderLoginModal() {
    return `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header blue">
            <h2 style="margin:0">Staff Login</h2>
            <button class="btn-light" data-action="close-login">Close</button>
          </div>
          <div class="modal-body">
            <div class="step-row">
              <div class="step ${state.loginStep === "scan" ? "active" : ""}">
                <span class="step-number">1</span>
                <span>Scan QR</span>
              </div>
              <div class="step-line"></div>
              <div class="step ${state.loginStep === "pin" ? "active" : ""}">
                <span class="step-number">2</span>
                <span>Enter PIN</span>
              </div>
            </div>
            ${state.loginError ? `<div class="error-box">${escapeHtml(state.loginError)}</div>` : ""}
            ${state.loginStep === "scan" ? `
              <div class="scanner-box">
                <strong>Scan your employee ID</strong>
                <p class="helper" style="margin:0.5rem 0 0">Position your QR code in front of the camera.</p>
              </div>
              <div style="margin-top:1rem">
                ${!state.scannerActive ? `<button class="btn-main" style="background:#2563eb" data-action="start-scanner">Start Camera</button>` : ""}
                ${state.scannerActive ? `
                  <div class="scanner-preview">
                    <video id="scanner-video" class="scanner-video" autoplay playsinline muted></video>
                  </div>
                  <button class="btn-danger" style="width:100%; margin-top:0.75rem" data-action="stop-scanner">Stop Camera</button>
                ` : ""}
                ${state.scannerError ? `<div class="info-box" style="margin-top:0.75rem">${escapeHtml(state.scannerError)}</div>` : ""}
              </div>
              <div class="or-row">OR</div>
              <label class="section-title" style="font-size:1rem">Enter QR Code Manually</label>
              <div class="action-row">
                <input class="input blue" name="scannedQR" type="text" placeholder="e.g. ADMIN001" value="${escapeHtml(state.scannedQR)}" />
                <button class="btn-main" style="width:auto; background:#2563eb" data-action="submit-manual-qr">Next</button>
              </div>
              <div class="status-block" style="margin-top:1rem">
                <div class="meta"><strong>Demo Credentials:</strong></div>
                <div class="meta" style="margin-top:0.35rem">QR Code: <strong>ADMIN001</strong></div>
                <div class="meta">PIN: <strong>1234</strong></div>
              </div>
            ` : `
              <div class="success-box">
                <strong>${escapeHtml(state.scannedEmployee.name)}</strong><br />
                <span class="meta" style="color:inherit">${escapeHtml(state.scannedEmployee.role.toUpperCase())}</span>
              </div>
              <label class="section-title" style="font-size:1rem">Enter Your PIN</label>
              <input class="input blue" name="pin" type="password" maxlength="6" placeholder="1234" value="${escapeHtml(state.pin)}" />
              <div class="toolbar-actions" style="margin-top:1rem">
                <button class="btn-light" data-action="back-to-scan">Back</button>
                <button class="btn-main" style="width:auto; background:#2563eb" data-action="submit-pin">Login</button>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function renderAddEmployeeModal() {
    return `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header blue">
            <h2 style="margin:0">Add New Employee</h2>
            <button class="btn-light" data-action="close-add-employee">Close</button>
          </div>
          <div class="modal-body">
            ${state.employeeError ? `<div class="error-box">${escapeHtml(state.employeeError)}</div>` : ""}
            <label class="section-title" style="font-size:1rem">Full Name</label>
            <input class="input blue" name="employeeName" type="text" placeholder="John Doe" value="${escapeHtml(state.employeeForm.name)}" />
            <label class="section-title" style="font-size:1rem; margin-top:1rem">PIN Code (4-6 digits)</label>
            <input class="input blue" name="employeePin" type="password" maxlength="6" placeholder="1234" value="${escapeHtml(state.employeeForm.pin)}" />
            <label class="section-title" style="font-size:1rem; margin-top:1rem">Role</label>
            <select class="select" name="employeeRole">
              <option value="cashier" ${state.employeeForm.role === "cashier" ? "selected" : ""}>Cashier</option>
              <option value="admin" ${state.employeeForm.role === "admin" ? "selected" : ""}>Admin</option>
            </select>
            <p class="helper" style="margin-top:0.5rem">Admin can manage employees. Cashier can only process orders.</p>
            <div class="toolbar-actions" style="margin-top:1rem">
              <button class="btn-light" data-action="close-add-employee">Cancel</button>
              <button class="btn-main" style="width:auto; background:#2563eb" data-action="submit-add-employee">Add Employee</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEmployeeQrModal() {
    const employee = state.employees.find(item => item.qrCode === state.qrEmployeeCode);
    if (!employee) {
      return "";
    }

    return `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header green">
            <h2 style="margin:0">Employee QR Code</h2>
            <button class="btn-light" data-action="close-employee-qr">Close</button>
          </div>
          <div class="modal-body">
            <div style="text-align:center">
              <h3>${escapeHtml(employee.name)}</h3>
              <p class="meta">${escapeHtml(employee.qrCode)}</p>
            </div>
            <div class="qr-canvas-wrap">
              <canvas id="employee-qr-canvas"></canvas>
            </div>
            <div class="info-box">
              <strong>Instructions:</strong> Print this QR code or save it to the employee device. They will scan it during login.
            </div>
            <div class="toolbar-actions">
              <button class="btn-secondary" data-action="download-employee-qr">Download</button>
              <button class="btn-main" style="width:auto" data-action="print-employee-qr">Print</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function drawEmployeeQr() {
    const employee = state.employees.find(item => item.qrCode === state.qrEmployeeCode);
    const canvas = document.getElementById("employee-qr-canvas");
    if (!employee || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    const size = 300;
    const moduleSize = 10;
    const modules = size / moduleSize;
    canvas.width = size;
    canvas.height = size;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#000000";

    function finder(x, y) {
      context.fillRect(x * moduleSize, y * moduleSize, 7 * moduleSize, 7 * moduleSize);
      context.fillStyle = "#ffffff";
      context.fillRect((x + 1) * moduleSize, (y + 1) * moduleSize, 5 * moduleSize, 5 * moduleSize);
      context.fillStyle = "#000000";
      context.fillRect((x + 2) * moduleSize, (y + 2) * moduleSize, 3 * moduleSize, 3 * moduleSize);
    }

    finder(0, 0);
    finder(modules - 7, 0);
    finder(0, modules - 7);

    for (let i = 0; i < employee.qrCode.length; i += 1) {
      const charCode = employee.qrCode.charCodeAt(i);
      for (let j = 0; j < 8; j += 1) {
        if ((charCode >> j) & 1) {
          const x = (8 + i * 2 + j) % modules;
          const y = (8 + Math.floor((i * 8 + j) / modules)) % modules;
          context.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
        }
      }
    }
  }

  function render() {
    appRoot.innerHTML = state.loggedInEmployee ? renderStaffView() : renderStudentView();
    if (state.qrEmployeeCode) {
      drawEmployeeQr();
    }
  }

  appRoot.addEventListener("click", async event => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    const productId = Number(target.dataset.id);
    const cartItem = Number.isNaN(productId) ? null : getCartItem(productId);

    if (action === "start-order") state.screen = "menu";
    if (action === "back-landing") state.screen = "landing";
    if (action === "set-category") state.selectedCategory = Number(target.dataset.id);
    if (action === "add-cart") addToCart(productId);
    if (action === "goto-cart") state.screen = "cart";
    if (action === "goto-menu") state.screen = "menu";
    if (action === "decrease-cart" && cartItem) updateQuantity(productId, cartItem.quantity - 1);
    if (action === "increase-cart" && cartItem) updateQuantity(productId, cartItem.quantity + 1);
    if (action === "remove-cart") updateQuantity(productId, 0);
    if (action === "goto-checkout") state.screen = "checkout";
    if (action === "select-payment") {
      state.paymentMethod = target.dataset.method;
      state.paymentError = "";
      state.screen = "checkout";
    }
    if (action === "back-payment") resetPaymentState();
    if (action === "confirm-cash") {
      const received = parseFloat(state.cashAmount);
      if (Number.isNaN(received) || received <= 0) {
        state.paymentError = "Please enter a valid amount";
      } else if (received < totalAmount()) {
        state.paymentError = `Insufficient amount. Need ${peso(totalAmount())}`;
      } else {
        await placeOrder("cash", { amountReceived: received });
        return;
      }
    }
    if (action === "confirm-gcash") {
      if (!state.gcashReference.trim()) {
        state.paymentError = "Please enter a reference number";
      } else if (state.gcashReference.trim().length < 10) {
        state.paymentError = "Reference number must be at least 10 characters";
      } else {
        state.paymentError = "";
        state.isVerifying = true;
        render();
        setTimeout(() => {
          state.isVerifying = false;
          placeOrder("gcash", { referenceNumber: state.gcashReference.trim() });
        }, 800);
        return;
      }
    }
    if (action === "new-order") {
      state.currentOrder = null;
      state.screen = "menu";
      await loadBootstrapData();
    }
    if (action === "open-login") state.loginOpen = true;
    if (action === "close-login") {
      stopScanner();
      state.loginOpen = false;
      state.loginStep = "scan";
      state.loginError = "";
      state.scannedEmployee = null;
      state.pin = "";
      state.scannedQR = "";
      state.scannerError = "";
    }
    if (action === "start-scanner") {
      await startScanner();
      return;
    }
    if (action === "stop-scanner") stopScanner();
    if (action === "submit-manual-qr") {
      await submitManualQr();
      return;
    }
    if (action === "back-to-scan") {
      state.loginStep = "scan";
      state.loginError = "";
      state.scannedEmployee = null;
      state.pin = "";
    }
    if (action === "submit-pin") {
      await submitPin();
      return;
    }
    if (action === "logout-staff") {
      state.loggedInEmployee = null;
      state.screen = "landing";
      state.showEmployeeManagement = false;
      state.filter = "all";
      await loadBootstrapData();
    }
    if (action === "set-staff-section") {
      state.staffSection = target.dataset.section;
      state.showEmployeeManagement = state.staffSection === "staff";
    }
    if (action === "set-filter") state.filter = target.dataset.status;
    if (action === "toggle-employee-management") state.showEmployeeManagement = !state.showEmployeeManagement;
    if (action === "update-order-status") {
      await updateOrderStatus(Number(target.dataset.id), target.dataset.statusValue);
      return;
    }
    if (action === "open-add-employee") state.showAddEmployee = true;
    if (action === "close-add-employee") {
      state.showAddEmployee = false;
      state.employeeError = "";
      state.employeeForm = { name: "", pin: "", role: "cashier" };
    }
    if (action === "submit-add-employee") {
      await addEmployee();
      return;
    }
    if (action === "show-employee-qr") state.qrEmployeeCode = target.dataset.code;
    if (action === "close-employee-qr") state.qrEmployeeCode = null;
    if (action === "delete-employee") {
      await deleteEmployee(Number(target.dataset.id));
      return;
    }
    if (action === "download-employee-qr") {
      downloadEmployeeQr();
      return;
    }
    if (action === "print-employee-qr") {
      printEmployeeQr();
      return;
    }

    render();
  });

  appRoot.addEventListener("input", event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    let shouldRender = false;

    if (target.name === "cashAmount") {
      state.cashAmount = target.value;
      state.paymentError = "";
      shouldRender = true;
    }
    if (target.name === "gcashReference") {
      state.gcashReference = target.value;
      state.paymentError = "";
    }
    if (target.name === "scannedQR") {
      state.scannedQR = target.value.toUpperCase();
      state.loginError = "";
    }
    if (target.name === "pin") {
      state.pin = target.value;
      state.loginError = "";
    }
    if (target.name === "employeeName") {
      state.employeeForm.name = target.value;
      state.employeeError = "";
    }
    if (target.name === "employeePin") {
      state.employeeForm.pin = target.value.replace(/\D/g, "");
      state.employeeError = "";
    }
    if (target.name === "employeeRole") {
      state.employeeForm.role = target.value;
      state.employeeError = "";
    }
    if (target.name === "orderSearch") {
      state.orderSearch = target.value;
      shouldRender = true;
    }
    if (target.name === "menuSearch") {
      state.menuSearch = target.value;
      shouldRender = true;
    }

    if (shouldRender) {
      render();
    }
  });

  appRoot.addEventListener("submit", event => {
    event.preventDefault();
  });

  loadBootstrapData();
})();
