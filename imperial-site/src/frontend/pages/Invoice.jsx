import { useEffect, useRef, useState } from "react";
import { getAccount } from "../api/accountApi";
import {
  createClient as createClientApi,
  deleteClient as deleteClientApi,
  getClients,
  updateClient as updateClientApi,
} from "../api/clientsApi";
import { clearAuthToken, getAuthToken } from "../api/client";
import { getDeliveryChecks } from "../api/deliveryApi";
import {
  addStock as addStockApi,
  getInventory,
  getInventoryHistory,
  removeStock as removeStockApi,
} from "../api/inventoryApi";
import {
  createInvoice as createInvoiceApi,
  deleteInvoice as deleteInvoiceApi,
  downloadInvoicePdf,
  getInvoices,
} from "../api/invoicesApi";
import {
  createProduct as createProductApi,
  deleteProduct as deleteProductApi,
  getProducts,
  updateProduct as updateProductApi,
} from "../api/productsApi";
import {
  createPaymentCompany as createPaymentCompanyApi,
  deletePaymentCompany as deletePaymentCompanyApi,
  getPaymentCompanies,
  updatePaymentCompany as updatePaymentCompanyApi,
} from "../api/paymentCompaniesApi";
import { PagePanel, PageShell, PageToolbar } from "../components/layout/PageShell";
import ActionButton from "../components/ui/ActionButton";

const STOCK_HISTORY_PAGE_SIZE = 8;
const INVOICE_PAGE_SIZE = 10;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const YEAR_RANGE = 12;

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const formatUpdatedAt = (value) => {
  if (!value) {
    return "Not updated yet";
  }

  if (/\s(?:AEST|AEDT)$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
};

const generateInvoiceNumber = (invoices, date = new Date()) => {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const period = `${year}${month}`;

  const suffixes = invoices
    .map((invoice) => {
      const match = String(invoice.invoice_number || "").match(new RegExp(`^INV-${period}(\\d{3})$`));
      return match ? Number(match[1]) : 0;
    })
    .filter(Boolean);

  const nextSuffix = String((suffixes.length ? Math.max(...suffixes) : 0) + 1).padStart(3, "0");
  return `INV-${period}${nextSuffix}`;
};

const createInitialFormData = (invoices = []) => {
  const today = new Date();

  return {
    invoice_number: generateInvoiceNumber(invoices, today),
    client_name: "",
    payment_company_id: "",
    invoice_format: "1",
    issue_date: formatDateInput(today),
    due_date: formatDateInput(addDays(today, 14)),
    items: [{ product_id: "", description: "", quantity: 1, unit_price: 0, amount: 0 }],
  };
};

const sortClients = (clients) => [...clients].sort((a, b) => a.client_name.localeCompare(b.client_name));
const sortProducts = (products) => [...products].sort((a, b) => a.item.localeCompare(b.item));

const parseDateString = (value) => {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatDateDisplay = (value) => {
  const date = parseDateString(value);

  if (!date) {
    return "";
  }

  return date.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

export default function Invoice() {
  const invoiceFilterRef = useRef(null);
  const accessCheckStartedRef = useRef(false);
  const [invoices, setInvoices] = useState([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceClientFilter, setInvoiceClientFilter] = useState("");
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const [openInvoiceDatePicker, setOpenInvoiceDatePicker] = useState(null);
  const [invoiceCalendarMonth, setInvoiceCalendarMonth] = useState(new Date());
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ item: "", unit_price: "", stock_quantity: "", stock_comment: "" });
  const [productMessage, setProductMessage] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stockRows, setStockRows] = useState([]);
  const [stockInputs, setStockInputs] = useState({});
  const [stockComments, setStockComments] = useState({});
  const [stockHistory, setStockHistory] = useState([]);
  const [stockHistoryPage, setStockHistoryPage] = useState(1);
  const [stockHistoryPageCount, setStockHistoryPageCount] = useState(1);
  const [stockHistoryTotalCount, setStockHistoryTotalCount] = useState(0);
  const [stockHistoryItem, setStockHistoryItem] = useState("");
  const [selectedHistoryProductId, setSelectedHistoryProductId] = useState("");
  const [stockMessage, setStockMessage] = useState("");
  const [deliveryChecks, setDeliveryChecks] = useState([]);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [clients, setClients] = useState([]);
  const [newClient, setNewClient] = useState({ client_name: "" });
  const [clientMessage, setClientMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [paymentCompanies, setPaymentCompanies] = useState([]);
  const [newPaymentCompany, setNewPaymentCompany] = useState({
    company_name: "",
    abn: "",
    address_line_1: "",
    address_line_2: "",
    bsb: "",
    account_name: "",
    account_number: "",
    notes: "",
  });
  const [paymentCompanyMessage, setPaymentCompanyMessage] = useState("");
  const [selectedPaymentCompanyId, setSelectedPaymentCompanyId] = useState("");
  const [activeView, setActiveView] = useState("menu");
  const [formData, setFormData] = useState(createInitialFormData());
  const [userId, setUserId] = useState(null);
  const [accountType, setAccountType] = useState("");
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [invoiceNotice, setInvoiceNotice] = useState(null);
  const [invoiceDeleteTarget, setInvoiceDeleteTarget] = useState(null);
  const [clientDeleteTarget, setClientDeleteTarget] = useState(null);
  const [productDeleteTarget, setProductDeleteTarget] = useState(null);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);

  const isAdmin = accountType === "Admin";
  const selectedProduct = products.find((product) => product.id === Number(selectedProductId));
  const selectedClient = clients.find((client) => client.id === Number(selectedClientId));

  const loadInvoices = async (accountId) => {
    try {
      const data = await getInvoices(accountId);
      setInvoices(data);
      setFormData((prev) => (prev.client_name ? prev : createInitialFormData(data)));
      return data;
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
      return [];
    }
  };

  const loadProducts = async () => {
    try {
      setProducts(await getProducts());
    } catch (err) {
      setProductMessage("Failed to load products: " + err.message);
    }
  };

  const loadClients = async () => {
    try {
      setClients(await getClients());
    } catch (err) {
      setClientMessage("Failed to load clients: " + err.message);
    }
  };

  const loadPaymentCompanies = async () => {
    try {
      const companies = await getPaymentCompanies();
      setPaymentCompanies(companies);
      if (!formData.payment_company_id && companies.length) {
        setFormData((prev) => ({ ...prev, payment_company_id: companies[0].id }));
      }
    } catch (err) {
      setPaymentCompanyMessage("Failed to load payment companies: " + err.message);
    }
  };

  const loadStock = async () => {
    try {
      setStockRows(await getInventory());
      setStockMessage("");
    } catch (err) {
      setStockMessage("Failed to load stock: " + err.message);
    }
  };

  const loadDeliveryChecks = async () => {
    try {
      setDeliveryChecks(await getDeliveryChecks());
      setDeliveryMessage("");
    } catch (err) {
      setDeliveryMessage("Failed to load delivery checks: " + err.message);
    }
  };

  useEffect(() => {
    if (accessCheckStartedRef.current) {
      return;
    }

    accessCheckStartedRef.current = true;

    if (!getAuthToken()) {
      window.location.href = "/imperial-site/login";
      return;
    }

    const loadInvoicePage = async () => {
      try {
        const account = await getAccount();

        if (!["Admin", "Staff"].includes(account.account_type)) {
          setInvoiceNotice({
            title: "Access denied",
            message: "Staff or admin access required.",
            redirectTo: "/imperial-site/account",
          });
          return;
        }

        setUserId(account.id);
        setAccountType(account.account_type);
        await Promise.all([loadInvoices(account.id), loadProducts(), loadClients(), loadPaymentCompanies()]);

        if (account.account_type === "Admin") {
          loadStock();
        }
      } catch (err) {
        if (err.status === 401) {
          clearAuthToken();
          window.location.href = "/imperial-site/login";
          return;
        }

        setInvoiceNotice({
          title: "Access check failed",
          message: `Failed to check account access: ${err.message}`,
          redirectTo: "/imperial-site/account",
        });
      }
    };

    loadInvoicePage();
  }, []);

  useEffect(() => {
    setInvoicePage(1);
  }, [invoiceSearch, invoiceClientFilter, invoiceDateFrom, invoiceDateTo]);

  useEffect(() => {
    const closeDatePicker = (event) => {
      if (!openInvoiceDatePicker) {
        return;
      }

      if (invoiceFilterRef.current && !invoiceFilterRef.current.contains(event.target)) {
        setOpenInvoiceDatePicker(null);
      }
    };

    document.addEventListener("mousedown", closeDatePicker);
    return () => document.removeEventListener("mousedown", closeDatePicker);
  }, [openInvoiceDatePicker]);

  const calculateTotals = () => {
    const total = formData.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const isNoGstFormat = String(formData.invoice_format || "1") === "2";
    const subtotal = isNoGstFormat ? total : total / 1.1;
    const tax = isNoGstFormat ? 0 : total - subtotal;
    return { subtotal, tax, total };
  };

  const handleInvoiceClientSelect = (value) => {
    setFormData((prev) => ({ ...prev, client_name: value }));
  };

  const handleInvoiceItemSelect = (index, value) => {
    const selected = products.find((product) => String(product.id) === String(value));

    setFormData((prev) => {
      const items = [...prev.items];
      const quantity = Number(items[index].quantity) || 0;
      items[index] = {
        ...items[index],
        product_id: value,
        description: selected?.item || "",
        unit_price: selected ? Number(selected.unit_price) : 0,
        amount: selected ? quantity * Number(selected.unit_price) : 0,
      };
      return { ...prev, items };
    });
  };

  const handleItemChange = (index, field, value) => {
    setFormData((prev) => {
      const items = [...prev.items];
      const parsedValue = field === "quantity" || field === "unit_price" ? Number(value) : value;
      items[index] = { ...items[index], [field]: parsedValue };

      if (field === "quantity" || field === "unit_price") {
        items[index].amount = (Number(items[index].quantity) || 0) * (Number(items[index].unit_price) || 0);
      }

      return { ...prev, items };
    });
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: "", description: "", quantity: 1, unit_price: 0, amount: 0 }],
    }));
  };

  const deleteItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items:
        prev.items.length <= 1
          ? [{ product_id: "", description: "", quantity: 1, unit_price: 0, amount: 0 }]
          : prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleNewProductChange = (e) => {
    const { name, value } = e.target;
    setNewProduct((prev) => ({ ...prev, [name]: value }));
  };

  const handleProductChange = (productId, field, value) => {
    setProducts((prev) =>
      prev.map((product) => (product.id === productId ? { ...product, [field]: value } : product))
    );
  };

  const createProduct = async (e) => {
    e.preventDefault();
    setProductMessage("");

    try {
      const data = await createProductApi(newProduct);
      setProducts((prev) => sortProducts([...prev, data]));
      setNewProduct({ item: "", unit_price: "", stock_quantity: "", stock_comment: "" });
      setProductMessage("Product created.");
      if (isAdmin) {
        loadStock();
      }
    } catch (err) {
      setProductMessage("Failed to create product: " + err.message);
    }
  };

  const updateProduct = async (product) => {
    setProductMessage("");

    try {
      const data = await updateProductApi(product.id, {
        item: product.item,
        unit_price: product.unit_price,
      });
      setProducts((prev) => sortProducts(prev.map((item) => (item.id === product.id ? { ...item, ...data } : item))));
      setProductMessage("Product updated.");
    } catch (err) {
      setProductMessage("Failed to update product: " + err.message);
    }
  };

  const requestDeleteProduct = (product) => {
    setProductDeleteTarget(product);
  };

  const confirmDeleteProduct = async () => {
    if (!productDeleteTarget || isDeletingProduct) {
      return;
    }

    const productId = productDeleteTarget.id;

    setIsDeletingProduct(true);
    setProductMessage("");

    try {
      await deleteProductApi(productId);
      setProducts((prev) => prev.filter((product) => product.id !== productId));
      if (String(productId) === String(selectedProductId)) {
        setSelectedProductId("");
      }
      setProductMessage("Product deleted.");
      setProductDeleteTarget(null);
    } catch (err) {
      setProductMessage("Failed to delete product: " + err.message);
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const handleNewClientChange = (e) => {
    const { name, value } = e.target;
    setNewClient((prev) => ({ ...prev, [name]: value }));
  };

  const handleClientChange = (clientId, value) => {
    setClients((prev) =>
      prev.map((client) => (client.id === clientId ? { ...client, client_name: value } : client))
    );
  };

  const createClient = async (e) => {
    e.preventDefault();
    setClientMessage("");

    try {
      const data = await createClientApi(newClient);
      setClients((prev) => sortClients([...prev, data]));
      setNewClient({ client_name: "" });
      setClientMessage("Client created.");
    } catch (err) {
      setClientMessage("Failed to create client: " + err.message);
    }
  };

  const updateClient = async (client) => {
    setClientMessage("");

    try {
      const data = await updateClientApi(client.id, { client_name: client.client_name });
      setClients((prev) => sortClients(prev.map((item) => (item.id === client.id ? { ...item, ...data } : item))));
      setClientMessage("Client updated.");
    } catch (err) {
      setClientMessage("Failed to update client: " + err.message);
    }
  };

  const handleNewPaymentCompanyChange = (e) => {
    const { name, value } = e.target;
    setNewPaymentCompany((prev) => ({ ...prev, [name]: value }));
  };

  const handlePaymentCompanyChange = (companyId, field, value) => {
    setPaymentCompanies((prev) =>
      prev.map((company) => (company.id === companyId ? { ...company, [field]: value } : company))
    );
  };

  const createPaymentCompany = async (e) => {
    e.preventDefault();
    setPaymentCompanyMessage("");

    try {
      const data = await createPaymentCompanyApi(newPaymentCompany);
      setPaymentCompanies((prev) => [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name)));
      setNewPaymentCompany({
        company_name: "",
        abn: "",
        address_line_1: "",
        address_line_2: "",
        bsb: "",
        account_name: "",
        account_number: "",
        notes: "",
      });
      setPaymentCompanyMessage("Receiving company created.");
      setFormData((prev) => ({ ...prev, payment_company_id: data.id }));
    } catch (err) {
      setPaymentCompanyMessage("Failed to create receiving company: " + err.message);
    }
  };

  const updatePaymentCompany = async (company) => {
    setPaymentCompanyMessage("");

    try {
      const data = await updatePaymentCompanyApi(company.id, {
        company_name: company.company_name,
        abn: company.abn,
        address_line_1: company.address_line_1,
        address_line_2: company.address_line_2,
        bsb: company.bsb,
        account_name: company.account_name,
        account_number: company.account_number,
        notes: company.notes,
      });
      setPaymentCompanies((prev) =>
        [...prev.map((item) => (item.id === company.id ? { ...item, ...data } : item))].sort((a, b) => a.company_name.localeCompare(b.company_name))
      );
      setPaymentCompanyMessage("Receiving company updated.");
    } catch (err) {
      setPaymentCompanyMessage("Failed to update receiving company: " + err.message);
    }
  };

  const requestDeleteClient = (client) => {
    setClientDeleteTarget(client);
  };

  const confirmDeleteClient = async () => {
    if (!clientDeleteTarget || isDeletingClient) {
      return;
    }

    const clientId = clientDeleteTarget.id;

    setIsDeletingClient(true);
    setClientMessage("");

    try {
      await deleteClientApi(clientId);
      setClients((prev) => prev.filter((client) => client.id !== clientId));
      if (String(clientId) === String(selectedClientId)) {
        setSelectedClientId("");
      }
      setClientMessage("Client deleted.");
      setClientDeleteTarget(null);
    } catch (err) {
      setClientMessage("Failed to delete client: " + err.message);
    } finally {
      setIsDeletingClient(false);
    }
  };

  const requestDeletePaymentCompany = async (company) => {
    setPaymentCompanyMessage("");

    try {
      await deletePaymentCompanyApi(company.id);
      setPaymentCompanies((prev) => prev.filter((item) => item.id !== company.id));
      if (String(company.id) === String(formData.payment_company_id)) {
        setFormData((prev) => ({ ...prev, payment_company_id: "" }));
      }
      if (String(company.id) === String(selectedPaymentCompanyId)) {
        setSelectedPaymentCompanyId("");
      }
      setPaymentCompanyMessage("Receiving company deleted.");
    } catch (err) {
      setPaymentCompanyMessage("Failed to delete receiving company: " + err.message);
    }
  };

  const handleStockInputChange = (productId, value) => {
    setStockInputs((prev) => ({ ...prev, [productId]: value }));
  };

  const handleStockCommentChange = (productId, value) => {
    setStockComments((prev) => ({ ...prev, [productId]: value }));
  };

  const fetchStockHistory = async (productId, page = 1) => {
    try {
      const data = await getInventoryHistory(productId, {
        page,
        pageSize: STOCK_HISTORY_PAGE_SIZE,
      });
      setSelectedHistoryProductId(productId);
      setStockHistoryItem(data.item);
      setStockHistory(data.history);
      setStockHistoryPage(data.pagination?.page || page);
      setStockHistoryPageCount(data.pagination?.total_pages || 1);
      setStockHistoryTotalCount(data.pagination?.total_count || data.history.length);
      setStockMessage("");
    } catch (err) {
      setStockMessage("Failed to load stock history: " + err.message);
    }
  };

  const updateStockState = (productId, stockQuantity) => {
    setStockRows((prev) =>
      prev.map((row) => (String(row.product_id) === String(productId) ? { ...row, stock_quantity: stockQuantity } : row))
    );
    setProducts((prev) =>
      prev.map((product) => (String(product.id) === String(productId) ? { ...product, stock_quantity: stockQuantity } : product))
    );
    setStockInputs((prev) => ({ ...prev, [productId]: "" }));
    setStockComments((prev) => ({ ...prev, [productId]: "" }));
  };

  const addStock = async (productId) => {
    const quantity = stockInputs[productId];
    const comment = stockComments[productId] || "";
    setStockMessage("");

    try {
      const data = await addStockApi(productId, { quantity, comment });
      updateStockState(productId, data.stock_quantity);
      setStockMessage("Stock updated.");
      if (String(selectedHistoryProductId) === String(productId)) {
        fetchStockHistory(productId, 1);
      }
    } catch (err) {
      setStockMessage("Failed to update stock: " + err.message);
    }
  };

  const removeStock = async (productId) => {
    const quantity = stockInputs[productId];
    const comment = stockComments[productId] || "";
    setStockMessage("");

    try {
      const data = await removeStockApi(productId, { quantity, comment });
      updateStockState(productId, data.stock_quantity);
      setStockMessage("Stock removed.");
      if (String(selectedHistoryProductId) === String(productId)) {
        fetchStockHistory(productId, 1);
      }
    } catch (err) {
      setStockMessage("Failed to remove stock: " + err.message);
    }
  };

  const applyInvoiceStockChange = (items) => {
    const changes = items.reduce((acc, item) => {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity) || 0;

      if (!productId || quantity <= 0) {
        return acc;
      }

      acc[productId] = (acc[productId] || 0) + quantity;
      return acc;
    }, {});

    setProducts((prev) =>
      prev.map((product) =>
        changes[product.id]
          ? { ...product, stock_quantity: Number(product.stock_quantity || 0) - changes[product.id] }
          : product
      )
    );
    setStockRows((prev) =>
      prev.map((row) =>
        changes[row.product_id]
          ? { ...row, stock_quantity: Number(row.stock_quantity || 0) - changes[row.product_id] }
          : row
      )
    );
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();

    if (isCreatingInvoice) {
      return;
    }

    if (!formData.invoice_number || !formData.client_name || !formData.issue_date || !formData.payment_company_id) {
      setInvoiceNotice({
        title: "Missing invoice details",
        message: "Please fill in all required fields: Invoice #, Client Name, Receiving Company, and Issue Date.",
      });
      return;
    }

    const hasValidItem = formData.items.some(
      (item) => item.description && Number(item.quantity) > 0 && Number(item.unit_price) > 0
    );
    if (!hasValidItem) {
      setInvoiceNotice({
        title: "Missing invoice item",
        message: "Please add at least one item with product, quantity, and unit price.",
      });
      return;
    }

    const { subtotal, tax, total } = calculateTotals();
    setIsCreatingInvoice(true);

    try {
      const createdInvoice = await createInvoiceApi({
        user_id: userId,
        invoice_number: formData.invoice_number,
        client_name: formData.client_name,
        payment_company_id: Number(formData.payment_company_id),
        invoice_format: formData.invoice_format || "1",
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        items: formData.items,
        subtotal,
        tax,
        total,
      });

      const nextInvoices = [createdInvoice, ...invoices];
      setInvoices(nextInvoices);
      setFormData(createInitialFormData(nextInvoices));
      applyInvoiceStockChange(formData.items);
      setActiveView("menu");
      setInvoiceNotice({
        title: "Invoice created",
        message: "The invoice has been created successfully.",
      });
    } catch (err) {
      setInvoiceNotice({
        title: "Invoice creation failed",
        message: `Failed to create invoice: ${err.message}`,
      });
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const downloadPDF = async (invoiceId, invoiceNumber) => {
    try {
      const blob = await downloadInvoicePdf(invoiceId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setInvoiceNotice({
        title: "Download failed",
        message: `Failed to download invoice: ${err.message}`,
      });
    }
  };

  const requestDeleteInvoice = (invoice) => {
    setInvoiceDeleteTarget(invoice);
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceDeleteTarget || isDeletingInvoice) {
      return;
    }

    const invoiceId = invoiceDeleteTarget.id;

    setIsDeletingInvoice(true);

    try {
      await deleteInvoiceApi(invoiceId);
      setInvoices((prev) => prev.filter((invoice) => invoice.id !== invoiceId));
      setInvoiceDeleteTarget(null);
      setInvoiceNotice({
        title: "Invoice deleted",
        message: "The invoice has been deleted and stock has been returned.",
      });
      loadProducts();
      if (isAdmin) {
        loadStock();
        if (selectedHistoryProductId) {
          fetchStockHistory(selectedHistoryProductId, 1);
        }
      }
    } catch (err) {
      setInvoiceNotice({
        title: "Delete failed",
        message: `Failed to delete invoice: ${err.message}`,
      });
    } finally {
      setIsDeletingInvoice(false);
    }
  };

  const closeInvoiceNotice = () => {
    const redirectTo = invoiceNotice?.redirectTo;

    setInvoiceNotice(null);

    if (redirectTo) {
      window.location.href = redirectTo;
    }
  };

  const openInvoiceView = (view) => {
    if (view === "stock" && !isAdmin) {
      return;
    }

    setActiveView(view);

    if (view === "stock") {
      loadStock();
    } else if (view === "delivery") {
      loadDeliveryChecks();
    }
  };

  const returnToMenu = () => {
    setActiveView("menu");
  };

  const { subtotal, tax, total } = calculateTotals();
  const openDateFilter = (field, value) => {
    setOpenInvoiceDatePicker(field);
    setInvoiceCalendarMonth(parseDateString(value) || new Date());
  };
  const moveInvoiceCalendarMonth = (offset) => {
    setInvoiceCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };
  const updateInvoiceCalendarMonth = (month) => {
    setInvoiceCalendarMonth((current) => new Date(current.getFullYear(), Number(month), 1));
  };
  const updateInvoiceCalendarYear = (year) => {
    setInvoiceCalendarMonth((current) => new Date(Number(year), current.getMonth(), 1));
  };
  const selectInvoiceFilterDate = (field, date) => {
    const value = formatDateInput(date);

    if (field === "from") {
      setInvoiceDateFrom(value);
    } else {
      setInvoiceDateTo(value);
    }

    setOpenInvoiceDatePicker(null);
  };
  const renderInvoiceDatePicker = (field, selectedValue) => {
    if (openInvoiceDatePicker !== field) {
      return null;
    }

    const year = invoiceCalendarMonth.getFullYear();
    const month = invoiceCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selectedDate = parseDateString(selectedValue);
    const yearOptions = Array.from(
      { length: YEAR_RANGE * 2 + 1 },
      (_, index) => year - YEAR_RANGE + index
    );
    const days = [
      ...Array.from({ length: firstDay.getDay() }, (_, index) => ({ key: `empty-${index}`, day: null })),
      ...Array.from({ length: daysInMonth }, (_, index) => ({
        key: `day-${index + 1}`,
        day: new Date(year, month, index + 1),
      })),
    ];

    return (
      <div className="invoice-date-picker">
        <div className="invoice-date-picker__header">
          <div className="invoice-date-picker__selectors">
            <select
              value={month}
              onChange={(e) => updateInvoiceCalendarMonth(e.target.value)}
              className="form-control invoice-date-picker__select"
              aria-label="Month"
            >
              {MONTH_NAMES.map((monthName, index) => (
                <option key={monthName} value={index}>
                  {monthName}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => updateInvoiceCalendarYear(e.target.value)}
              className="form-control invoice-date-picker__select"
              aria-label="Year"
            >
              {yearOptions.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>
          <div className="invoice-date-picker__nav">
            <ActionButton type="button" variant="light" size="sm" onClick={() => moveInvoiceCalendarMonth(-1)}>
              Previous
            </ActionButton>
            <ActionButton type="button" variant="light" size="sm" onClick={() => moveInvoiceCalendarMonth(1)}>
              Next
            </ActionButton>
          </div>
        </div>
        <div className="invoice-date-picker__grid invoice-date-picker__weekdays">
          {WEEKDAY_NAMES.map((dayName) => (
            <span key={dayName}>{dayName}</span>
          ))}
        </div>
        <div className="invoice-date-picker__grid">
          {days.map(({ key, day }) => {
            const isSelected =
              day &&
              selectedDate &&
              day.getFullYear() === selectedDate.getFullYear() &&
              day.getMonth() === selectedDate.getMonth() &&
              day.getDate() === selectedDate.getDate();
            const today = new Date();
            const isToday =
              day &&
              day.getFullYear() === today.getFullYear() &&
              day.getMonth() === today.getMonth() &&
              day.getDate() === today.getDate();

            return day ? (
              <button
                key={key}
                type="button"
                className={`invoice-date-picker__day${isToday ? " invoice-date-picker__day--today" : ""}${isSelected ? " invoice-date-picker__day--selected" : ""}`}
                onClick={() => selectInvoiceFilterDate(field, day)}
              >
                {day.getDate()}
              </button>
            ) : (
              <span key={key} className="invoice-date-picker__empty"></span>
            );
          })}
        </div>
      </div>
    );
  };
  const invoiceClientOptions = [...new Set(invoices.map((invoice) => invoice.client_name).filter(Boolean))].sort();
  const filteredInvoices = invoices.filter((invoice) => {
    const searchValue = invoiceSearch.trim().toLowerCase();
    const matchesSearch = searchValue
      ? [invoice.invoice_number, invoice.client_name, invoice.issue_date]
          .some((value) => String(value || "").toLowerCase().includes(searchValue))
      : true;
    const matchesClient = invoiceClientFilter ? invoice.client_name === invoiceClientFilter : true;
    const matchesFrom = invoiceDateFrom ? invoice.issue_date >= invoiceDateFrom : true;
    const matchesTo = invoiceDateTo ? invoice.issue_date <= invoiceDateTo : true;

    return matchesSearch && matchesClient && matchesFrom && matchesTo;
  });
  const invoicePageCount = Math.max(1, Math.ceil(filteredInvoices.length / INVOICE_PAGE_SIZE));
  const visibleInvoices = filteredInvoices.slice(
    (invoicePage - 1) * INVOICE_PAGE_SIZE,
    invoicePage * INVOICE_PAGE_SIZE
  );

  return (
    <PageShell
      title="Invoices"
      size="wide"
      actions={(
        <PageToolbar>
          {activeView === "menu" ? (
            <>
              <ActionButton onClick={() => openInvoiceView("create")}>
                Create Invoice
              </ActionButton>
              {isAdmin && (
                <>
                  <ActionButton variant="secondary" onClick={() => openInvoiceView("items")}>
                    Edit Item
                  </ActionButton>
                  <ActionButton variant="muted" onClick={() => openInvoiceView("clients")}>
                    Client
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openInvoiceView("payment-companies")}>
                    Receiving Company
                  </ActionButton>
                  <ActionButton variant="success" onClick={() => openInvoiceView("stock")}>
                    Stock Check
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openInvoiceView("delivery")}>
                    Delivery Check
                  </ActionButton>
                </>
              )}
            </>
          ) : (
            <ActionButton variant="secondary" onClick={returnToMenu}>
              Back to menu
            </ActionButton>
          )}
        </PageToolbar>
      )}
    >
      {invoiceNotice && (
        <div className="invoice-notice" role="dialog" aria-modal="true" aria-labelledby="invoice-notice-title">
          <div className="invoice-notice__card">
            <h3 id="invoice-notice-title">{invoiceNotice.title}</h3>
            <p>{invoiceNotice.message}</p>
            <div className="invoice-notice__actions">
              <ActionButton type="button" onClick={closeInvoiceNotice}>
                Close
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {invoiceDeleteTarget && (
        <div className="invoice-notice" role="dialog" aria-modal="true" aria-labelledby="invoice-delete-title">
          <div className="invoice-notice__card">
            <h3 id="invoice-delete-title">Delete invoice</h3>
            <p>
              Delete invoice {invoiceDeleteTarget.invoice_number}? Stock will be returned for invoice items.
            </p>
            <div className="invoice-notice__actions">
              <ActionButton
                type="button"
                variant="light"
                onClick={() => setInvoiceDeleteTarget(null)}
                disabled={isDeletingInvoice}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="button"
                variant="danger"
                onClick={confirmDeleteInvoice}
                disabled={isDeletingInvoice}
              >
                {isDeletingInvoice ? "Deleting..." : "Delete invoice"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {clientDeleteTarget && (
        <div className="invoice-notice" role="dialog" aria-modal="true" aria-labelledby="client-delete-title">
          <div className="invoice-notice__card">
            <h3 id="client-delete-title">Delete client</h3>
            <p>
              Delete client {clientDeleteTarget.client_name}? Existing invoices will not be changed.
            </p>
            <div className="invoice-notice__actions">
              <ActionButton
                type="button"
                variant="light"
                onClick={() => setClientDeleteTarget(null)}
                disabled={isDeletingClient}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="button"
                variant="danger"
                onClick={confirmDeleteClient}
                disabled={isDeletingClient}
              >
                {isDeletingClient ? "Deleting..." : "Delete client"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {productDeleteTarget && (
        <div className="invoice-notice" role="dialog" aria-modal="true" aria-labelledby="product-delete-title">
          <div className="invoice-notice__card">
            <h3 id="product-delete-title">Delete item</h3>
            <p>
              Delete item {productDeleteTarget.item}? Existing invoices will not be changed.
            </p>
            <div className="invoice-notice__actions">
              <ActionButton
                type="button"
                variant="light"
                onClick={() => setProductDeleteTarget(null)}
                disabled={isDeletingProduct}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="button"
                variant="danger"
                onClick={confirmDeleteProduct}
                disabled={isDeletingProduct}
              >
                {isDeletingProduct ? "Deleting..." : "Delete item"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {isAdmin && activeView === "stock" && (
        <PagePanel title="Stock Check">
          {stockMessage && <p className="status-message">{stockMessage}</p>}

          {stockRows.length === 0 ? (
            <p>No products yet. Create items first.</p>
          ) : (
            <div className="stock-grid-scroll">
              <div className="stock-grid">
                <div className="stock-grid__row stock-grid__header">
                  <span>Item</span>
                  <span className="stock-grid__number">Stock</span>
                  <span>Qty</span>
                  <span>Comment</span>
                  <span className="stock-grid__center">History</span>
                  <span className="stock-grid__center">In</span>
                  <span className="stock-grid__center">Out</span>
                </div>
                {stockRows.map((row) => (
                  <div key={row.product_id} className="stock-grid__row stock-grid__item">
                    <span>{row.item}</span>
                    <span className="stock-grid__number">{Number(row.stock_quantity || 0).toFixed(2)}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Qty"
                      value={stockInputs[row.product_id] || ""}
                      onChange={(e) => handleStockInputChange(row.product_id, e.target.value)}
                      className="form-control"
                    />
                    <input
                      placeholder="Comment"
                      value={stockComments[row.product_id] || ""}
                      onChange={(e) => handleStockCommentChange(row.product_id, e.target.value)}
                      className="form-control"
                    />
                    <ActionButton type="button" variant="secondary" size="sm" onClick={() => fetchStockHistory(row.product_id)}>
                      View
                    </ActionButton>
                    <ActionButton type="button" variant="success" size="sm" onClick={() => addStock(row.product_id)}>
                      Stock In
                    </ActionButton>
                    <ActionButton type="button" variant="danger" size="sm" onClick={() => removeStock(row.product_id)}>
                      Stock Out
                    </ActionButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedHistoryProductId && (
            <div className="history-block">
              <h4 className="history-block__title">Stock history: {stockHistoryItem}</h4>
              {stockHistory.length === 0 ? (
                <p>No stock history yet.</p>
              ) : (
                <table className="data-table data-table--fixed">
                  <colgroup>
                    <col className="stock-history-col--time" />
                    <col className="stock-history-col--action" />
                    <col className="stock-history-col--change" />
                    <col className="stock-history-col--stock" />
                    <col className="stock-history-col--comment" />
                    <col className="stock-history-col--by" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th className="data-table__number">Change</th>
                      <th className="data-table__number">Stock after</th>
                      <th>Comment</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockHistory.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.created_at}</td>
                        <td>{entry.action_type}</td>
                        <td className="data-table__number">{Number(entry.change_quantity || 0).toFixed(2)}</td>
                        <td className="data-table__number">{Number(entry.stock_after || 0).toFixed(2)}</td>
                        <td>{entry.comment || "-"}</td>
                        <td>{entry.created_by || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {stockHistoryTotalCount > STOCK_HISTORY_PAGE_SIZE && (
                <div className="pagination">
                  <ActionButton
                    type="button"
                    variant={stockHistoryPage === 1 ? "ghost" : "light"}
                    size="sm"
                    onClick={() => fetchStockHistory(selectedHistoryProductId, Math.max(1, stockHistoryPage - 1))}
                    disabled={stockHistoryPage === 1}
                  >
                    Previous
                  </ActionButton>
                  <span className="pagination__label">Page {stockHistoryPage} of {stockHistoryPageCount}</span>
                  <ActionButton
                    type="button"
                    variant={stockHistoryPage === stockHistoryPageCount ? "ghost" : "light"}
                    size="sm"
                    onClick={() => fetchStockHistory(selectedHistoryProductId, Math.min(stockHistoryPageCount, stockHistoryPage + 1))}
                    disabled={stockHistoryPage === stockHistoryPageCount}
                  >
                    Next
                  </ActionButton>
                </div>
              )}
            </div>
          )}
        </PagePanel>
      )}

      {isAdmin && activeView === "delivery" && (
        <PagePanel title="Delivery Check">
          {deliveryMessage && <p className="status-message">{deliveryMessage}</p>}

          {deliveryChecks.length === 0 ? (
            <p>No delivery orders yet.</p>
          ) : (
            <div className="delivery-check-list">
              {deliveryChecks.map((delivery) => (
                <section key={delivery.order_id} className="delivery-check-card">
                  <div className="delivery-check-card__header">
                    <div>
                      <h4>Order #{delivery.order_id}</h4>
                      <p>{delivery.customer_name || "Customer"} · {delivery.phone || "No phone"}</p>
                    </div>
                    <span>{delivery.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="delivery-check-card__meta">
                    <p><strong>Driver:</strong> {delivery.driver_name || "Not assigned"}</p>
                    <p><strong>Address:</strong> {delivery.destination_address}</p>
                    <p><strong>Total:</strong> ${Number(delivery.order_total || 0).toFixed(2)}</p>
                    <p><strong>Last update:</strong> {delivery.updated_at || "-"}</p>
                  </div>

                  {delivery.logs?.length ? (
                    <table className="data-table delivery-log-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Event</th>
                          <th>Log</th>
                          <th>By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delivery.logs.map((log) => (
                          <tr key={log.id}>
                            <td>{log.created_at}</td>
                            <td>{log.event_type.replaceAll("_", " ")}</td>
                            <td>{log.message}</td>
                            <td>{log.created_by || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No delivery log yet.</p>
                  )}
                </section>
              ))}
            </div>
          )}
        </PagePanel>
      )}

      {isAdmin && activeView === "clients" && (
        <PagePanel title="Client">
          <form onSubmit={createClient} className="form-grid client-create-grid">
            <input
              name="client_name"
              placeholder="Client Name"
              value={newClient.client_name}
              onChange={handleNewClientChange}
              required
              className="form-control"
            />
            <ActionButton type="submit">Add</ActionButton>
          </form>

          {clientMessage && <p className="status-message">{clientMessage}</p>}

          {clients.length === 0 ? (
            <p>No clients yet. Create one above to use it in invoices.</p>
          ) : (
            <div className="client-edit-grid">
              <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="form-control">
                <option value="">Select client to edit</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_name}
                  </option>
                ))}
              </select>
              <input
                placeholder="Client Name"
                value={selectedClient?.client_name ?? ""}
                disabled={!selectedClient}
                onChange={(e) => handleClientChange(selectedClient.id, e.target.value)}
                className="form-control"
              />
              <ActionButton type="button" disabled={!selectedClient} variant="confirm" onClick={() => updateClient(selectedClient)}>
                Save
              </ActionButton>
              <ActionButton
                type="button"
                disabled={!selectedClient}
                variant="danger"
                onClick={() => requestDeleteClient(selectedClient)}
              >
                Delete
              </ActionButton>
            </div>
          )}
        </PagePanel>
      )}

      {isAdmin && activeView === "payment-companies" && (
        <PagePanel title="Receiving Company">
          <form onSubmit={createPaymentCompany} className="form-grid payment-company-create-grid">
            <input name="company_name" placeholder="Company Name" value={newPaymentCompany.company_name} onChange={handleNewPaymentCompanyChange} required className="form-control" />
            <input name="abn" placeholder="ABN" value={newPaymentCompany.abn} onChange={handleNewPaymentCompanyChange} className="form-control" />
            <input name="address_line_1" placeholder="Address line 1" value={newPaymentCompany.address_line_1} onChange={handleNewPaymentCompanyChange} className="form-control" />
            <input name="address_line_2" placeholder="Address line 2" value={newPaymentCompany.address_line_2} onChange={handleNewPaymentCompanyChange} className="form-control" />
            <input name="bsb" placeholder="BSB" value={newPaymentCompany.bsb} onChange={handleNewPaymentCompanyChange} className="form-control" />
            <input name="account_name" placeholder="Account name" value={newPaymentCompany.account_name} onChange={handleNewPaymentCompanyChange} className="form-control" />
            <input name="account_number" placeholder="Account number" value={newPaymentCompany.account_number} onChange={handleNewPaymentCompanyChange} className="form-control" />
            <input name="notes" placeholder="Notes" value={newPaymentCompany.notes} onChange={handleNewPaymentCompanyChange} className="form-control" />
            <ActionButton type="submit">Add company</ActionButton>
          </form>

          {paymentCompanyMessage && <p className="status-message">{paymentCompanyMessage}</p>}

          {paymentCompanies.length === 0 ? (
            <p>No receiving companies yet. Add your company details above.</p>
          ) : (
            <div className="payment-company-edit-grid">
              <select value={selectedPaymentCompanyId} onChange={(e) => setSelectedPaymentCompanyId(e.target.value)} className="form-control">
                <option value="">Select company to edit</option>
                {paymentCompanies.map((company) => (
                  <option key={company.id} value={company.id}>{company.company_name}</option>
                ))}
              </select>
              <input
                placeholder="Company name"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.company_name ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "company_name", e.target.value)}
                className="form-control"
              />
              <input
                placeholder="ABN"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.abn ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "abn", e.target.value)}
                className="form-control"
              />
              <input
                placeholder="Address line 1"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.address_line_1 ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "address_line_1", e.target.value)}
                className="form-control"
              />
              <input
                placeholder="Address line 2"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.address_line_2 ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "address_line_2", e.target.value)}
                className="form-control"
              />
              <input
                placeholder="BSB"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.bsb ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "bsb", e.target.value)}
                className="form-control"
              />
              <input
                placeholder="Account name"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.account_name ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "account_name", e.target.value)}
                className="form-control"
              />
              <input
                placeholder="Account number"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.account_number ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "account_number", e.target.value)}
                className="form-control"
              />
              <input
                placeholder="Notes"
                value={paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId))?.notes ?? ""}
                disabled={!selectedPaymentCompanyId}
                onChange={(e) => handlePaymentCompanyChange(Number(selectedPaymentCompanyId), "notes", e.target.value)}
                className="form-control"
              />
              <ActionButton type="button" disabled={!selectedPaymentCompanyId} variant="confirm" onClick={() => updatePaymentCompany(paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId)))}>
                Save
              </ActionButton>
              <ActionButton type="button" disabled={!selectedPaymentCompanyId} variant="danger" onClick={() => requestDeletePaymentCompany(paymentCompanies.find((company) => String(company.id) === String(selectedPaymentCompanyId)))}>
                Delete
              </ActionButton>
            </div>
          )}
        </PagePanel>
      )}

      {isAdmin && activeView === "items" && (
        <PagePanel title="Create Item">
          <form onSubmit={createProduct} className="form-grid product-create-grid">
            <input name="item" placeholder="Item" value={newProduct.item} onChange={handleNewProductChange} required className="form-control" />
            <input
              type="number"
              step="0.01"
              name="unit_price"
              placeholder="Unit Price /pkg"
              value={newProduct.unit_price}
              onChange={handleNewProductChange}
              required
              className="form-control"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              name="stock_quantity"
              placeholder="Initial Stock"
              value={newProduct.stock_quantity}
              onChange={handleNewProductChange}
              className="form-control"
            />
            <input
              name="stock_comment"
              placeholder="Stock comment"
              value={newProduct.stock_comment}
              onChange={handleNewProductChange}
              className="form-control"
            />
            <ActionButton type="submit">Add</ActionButton>
          </form>

          {productMessage && <p className="status-message">{productMessage}</p>}

          {products.length === 0 ? (
            <p>No products yet. Create one above to use it in invoices.</p>
          ) : (
            <div>
              <div className="product-edit-grid field-label-grid">
                <span></span>
                <span>Item name</span>
                <span>Unit price</span>
                <span></span>
                <span></span>
              </div>
              <div className="product-edit-grid">
                <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="form-control">
                  <option value="">Select item to edit</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.item}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Item name"
                  value={selectedProduct?.item ?? ""}
                  disabled={!selectedProduct}
                  onChange={(e) => handleProductChange(selectedProduct.id, "item", e.target.value)}
                  className="form-control"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Unit Price /pkg"
                  value={selectedProduct?.unit_price ?? ""}
                  disabled={!selectedProduct}
                  onChange={(e) => handleProductChange(selectedProduct.id, "unit_price", e.target.value)}
                  className="form-control"
                />
                <ActionButton type="button" disabled={!selectedProduct} variant="confirm" onClick={() => updateProduct(selectedProduct)}>
                  Save
                </ActionButton>
                <ActionButton
                  type="button"
                  disabled={!selectedProduct}
                  variant="danger"
                  onClick={() => requestDeleteProduct(selectedProduct)}
                >
                  Delete
                </ActionButton>
              </div>
              <p className="muted-note">Last updated: {formatUpdatedAt(selectedProduct?.updated_at)}</p>
            </div>
          )}
        </PagePanel>
      )}

      {activeView === "create" && (
        <PagePanel title="Create New Invoice">
          <form onSubmit={handleCreateInvoice}>
            <div className="form-grid form-grid--two">
              <input type="text" name="invoice_number" value={formData.invoice_number} readOnly className="form-control form-control--readonly" />
              <select
                name="invoice_format"
                value={formData.invoice_format || "1"}
                onChange={(e) => setFormData((prev) => ({ ...prev, invoice_format: e.target.value }))}
                className="form-control"
              >
                <option value="1">Invoice format 1 - GST 10%</option>
                <option value="2">Invoice format 2 - GST 0%</option>
              </select>
              <select
                name="client_name"
                value={formData.client_name}
                onChange={(e) => handleInvoiceClientSelect(e.target.value)}
                required
                className="form-control"
              >
                <option value="">{clients.length ? "Select Client" : "Create clients first"}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.client_name}>
                    {client.client_name}
                  </option>
                ))}
              </select>
              <select
                name="payment_company_id"
                value={formData.payment_company_id ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, payment_company_id: e.target.value }))}
                required
                className="form-control"
              >
                <option value="">{paymentCompanies.length ? "Select receiving company" : "Create receiving company first"}</option>
                {paymentCompanies.map((company) => (
                  <option key={company.id} value={company.id}>{company.company_name}</option>
                ))}
              </select>
              <input type="date" name="issue_date" value={formData.issue_date} readOnly className="form-control form-control--readonly" />
              <input type="date" value={formData.due_date} readOnly className="form-control form-control--readonly" />
            </div>

            <h4>Invoice Items</h4>
            <div className="invoice-items">
              <div className="invoice-item-grid invoice-item-grid--header">
                <span>Item</span>
                <span>Quantity</span>
                <span>Unit price</span>
                <span>Amount</span>
                <span></span>
              </div>
              {formData.items.map((item, index) => (
                <div key={index} className="invoice-item-grid invoice-item-row">
                  <select value={item.product_id} onChange={(e) => handleInvoiceItemSelect(index, e.target.value)} className="form-control">
                    <option value="">{products.length ? "Select item" : "Create products first"}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.item} ({Number(product.stock_quantity || 0).toFixed(2)} in stock)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="pkg"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                    className="form-control"
                  />
                  <input
                    type="number"
                    placeholder="Unit Price /pkg"
                    value={item.unit_price}
                    readOnly
                    className="form-control form-control--readonly"
                  />
                  <input type="number" placeholder="Amount" value={item.amount} disabled className="form-control" />
                  <ActionButton type="button" variant="danger" onClick={() => deleteItem(index)}>
                    Delete
                  </ActionButton>
                </div>
              ))}
              <ActionButton type="button" variant="light" onClick={addItem}>
                + Add Item
              </ActionButton>
            </div>

            <div className="invoice-totals">
              <p><strong>Subtotal:</strong> ${subtotal.toFixed(2)}</p>
              {String(formData.invoice_format || "1") !== "2" && (
                <p><strong>GST included (10%):</strong> ${tax.toFixed(2)}</p>
              )}
              <p className="invoice-totals__total"><strong>Total:</strong> ${total.toFixed(2)}</p>
            </div>

            <ActionButton type="submit" disabled={isCreatingInvoice}>
              {isCreatingInvoice ? "Creating..." : "Create Invoice"}
            </ActionButton>
          </form>
        </PagePanel>
      )}

      {activeView === "menu" && (
        <>
          <h3>Your Invoices</h3>
          <div className="invoice-filter-bar" ref={invoiceFilterRef}>
            <input
              type="search"
              placeholder="Search invoice, client, date"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="form-control"
            />
            <select
              value={invoiceClientFilter}
              onChange={(e) => setInvoiceClientFilter(e.target.value)}
              className="form-control"
            >
              <option value="">All clients</option>
              {invoiceClientOptions.map((clientName) => (
                <option key={clientName} value={clientName}>
                  {clientName}
                </option>
              ))}
            </select>
            <div className="invoice-date-filter">
              <button
                type="button"
                className="form-control invoice-date-filter__button"
                onClick={() => openDateFilter("from", invoiceDateFrom)}
              >
                {formatDateDisplay(invoiceDateFrom) || "From date"}
              </button>
              {renderInvoiceDatePicker("from", invoiceDateFrom)}
            </div>
            <div className="invoice-date-filter">
              <button
                type="button"
                className="form-control invoice-date-filter__button"
                onClick={() => openDateFilter("to", invoiceDateTo)}
              >
                {formatDateDisplay(invoiceDateTo) || "To date"}
              </button>
              {renderInvoiceDatePicker("to", invoiceDateTo)}
            </div>
            <ActionButton
              type="button"
              variant="light"
              onClick={() => {
                setInvoiceSearch("");
                setInvoiceClientFilter("");
                setInvoiceDateFrom("");
                setInvoiceDateTo("");
              }}
            >
              Clear
            </ActionButton>
          </div>

          {invoices.length === 0 ? (
            <p>No invoices yet. Create one to get started!</p>
          ) : filteredInvoices.length === 0 ? (
            <p>No invoices match the current filters.</p>
          ) : (
            <>
              <table className="data-table invoice-list-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Client</th>
                    <th>Issue Date</th>
                    <th className="data-table__number">Total</th>
                    <th className="invoice-list-table__actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.invoice_number}</td>
                      <td>{invoice.client_name}</td>
                      <td>{invoice.issue_date}</td>
                      <td className="data-table__number">${Number(invoice.total || 0).toFixed(2)}</td>
                      <td className="invoice-list-table__actions">
                        <ActionButton type="button" variant="confirm" size="sm" onClick={() => downloadPDF(invoice.id, invoice.invoice_number)}>
                          Download PDF
                        </ActionButton>
                        {isAdmin && (
                          <ActionButton
                            type="button"
                            variant="danger"
                            size="sm"
                            className="invoice-list-table__delete"
                            onClick={() => requestDeleteInvoice(invoice)}
                          >
                            Delete
                          </ActionButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInvoices.length > INVOICE_PAGE_SIZE && (
                <div className="pagination">
                  <ActionButton
                    type="button"
                    variant={invoicePage === 1 ? "ghost" : "light"}
                    size="sm"
                    onClick={() => setInvoicePage((page) => Math.max(1, page - 1))}
                    disabled={invoicePage === 1}
                  >
                    Previous
                  </ActionButton>
                  <span className="pagination__label">
                    Page {invoicePage} of {invoicePageCount}
                  </span>
                  <ActionButton
                    type="button"
                    variant={invoicePage === invoicePageCount ? "ghost" : "light"}
                    size="sm"
                    onClick={() => setInvoicePage((page) => Math.min(invoicePageCount, page + 1))}
                    disabled={invoicePage === invoicePageCount}
                  >
                    Next
                  </ActionButton>
                </div>
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
