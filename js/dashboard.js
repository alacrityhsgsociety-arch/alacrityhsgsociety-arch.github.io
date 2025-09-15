document.addEventListener("DOMContentLoaded", async () => {
  const inflowContainer = document.getElementById("inflow-charts");
  const expenseContainer = document.getElementById("expense-charts");
  const sundryContainer = document.getElementById("sundry-charts");
  const monthSelect = document.getElementById("monthSelect");
  const periodSelect = document.getElementById("periodSelect"); // may be null if not present
  const expenseTableBody = document.querySelector("#expense-table tbody");
  const fdTableBody = document.getElementById("fd-table-body");
  const fdTotalEl = document.getElementById("fd-total");

  const RAW_JSON_BASE =
    "https://raw.githubusercontent.com/alacrityhsgsociety-arch/alacrityhsgsociety-arch.github.io/refs/heads/main/data";
  const INDEX_FILE = `${RAW_JSON_BASE}/index.json?v=${Date.now()}`;

  const monthNames = [
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

  const COLORS = [
    "#4e79a7",
    "#f28e2b",
    "#e15759",
    "#76b7b2",
    "#59a14f",
    "#edc948",
    "#b07aa1",
    "#ff9da7",
    "#9c755f",
    "#bab0ac",
  ];

  const allData = {};

  // Populate month dropdown
  monthNames.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = name;
    if (index === new Date().getMonth()) option.selected = true;
    monthSelect.appendChild(option);
  });

  // Fetch index.json with cache-busting
  let files = [];
  try {
    const res = await fetch(INDEX_FILE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    files = await res.json();
  } catch (err) {
    console.error("Failed to load index.json:", err);
    if (inflowContainer)
      inflowContainer.innerHTML = `<p class="text-danger">Failed to load data.</p>`;
    return;
  }

  const parseAmount = (value) => {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "string") {
      // remove currency symbol, spaces and commas
      value = value.replace(/[₹,\s]/g, "");
      // handle possible parentheses for negative numbers
      if (value.startsWith("(") && value.endsWith(")")) {
        value = "-" + value.slice(1, -1);
      }
      return parseFloat(value) || 0;
    }
    if (typeof value === "number") return value;
    return 0;
  };

  const clearSections = () => {
    if (inflowContainer) inflowContainer.innerHTML = "";
    if (expenseContainer) expenseContainer.innerHTML = "";
    if (sundryContainer) sundryContainer.innerHTML = "";
    if (expenseTableBody) expenseTableBody.innerHTML = "";
    if (fdTableBody) fdTableBody.innerHTML = "";
    if (fdTotalEl) fdTotalEl.textContent = "";
  };

  // Plugin to show totals above stacked bars (unchanged)
  const showTotalsPlugin = {
    id: "showTotals",
    afterDatasetsDraw(chart) {
      const {
        ctx,
        scales: { x, y },
      } = chart;
      ctx.save();
      chart.data.labels.forEach((label, index) => {
        let total = 0;
        chart.data.datasets.forEach((ds) => (total += ds.data[index] || 0));
        if (total > 0) {
          const xPos =
            typeof x.getPixelForValue === "function"
              ? x.getPixelForValue(index)
              : (index + 0.5) * (chart.width / chart.data.labels.length);
          const yPos =
            typeof y.getPixelForValue === "function"
              ? y.getPixelForValue(total)
              : chart.height - (total / (y.max || 1)) * chart.height;
          ctx.fillStyle = "#000";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(
            `₹${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
            xPos,
            yPos - 5
          );
        }
      });
      ctx.restore();
    },
  };

  // ---- FD renderer (mirrors renderExpenseTable style) ----
  function renderFixedDepositTable(fdRows) {
    if (!fdTableBody) return;
    fdTableBody.innerHTML = "";

    if (!Array.isArray(fdRows) || fdRows.length === 0) {
      // show empty row
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" class="text-center text-muted">No FDs found</td>`;
      fdTableBody.appendChild(tr);
      if (fdTotalEl) fdTotalEl.textContent = "";
      return;
    }

    // sort optional: by Category then Account
    fdRows.sort((a, b) => {
      const ca = (a.Category || a.category || "").localeCompare(
        b.Category || b.category || ""
      );
      if (ca !== 0) return ca;
      return (a.Account || a.account || "").localeCompare(
        b.Account || b.account || ""
      );
    });

    let totalAmount = 0;
    fdRows.forEach((row) => {
      const amt = parseAmount(row["Amount"] || row["amount"]);
      totalAmount += amt;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row["Category"] || row["category"] || ""}</td>
        <td>${row["Account"] || row["account"] || ""}</td>
        <td class="text-end">₹ ${amt.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
        })}</td>
      `;
      fdTableBody.appendChild(tr);
    });

    // total row
    const totalTr = document.createElement("tr");
    totalTr.classList.add("fw-bold", "table-light");
    // totalTr.innerHTML = `
    //   <td colspan="2" class="text-end">Total FD</td>
    //   <td class="text-end">₹ ${totalAmount.toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
    // `;
    fdTableBody.appendChild(totalTr);

    if (fdTotalEl)
      fdTotalEl.textContent = `₹ ${totalAmount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`;
  }

  // Load FD JSON and render the FD table
  async function loadFDData() {
    try {
      const res = await fetch(
        `${RAW_JSON_BASE}/fixed_deposit.json?v=${Date.now()}`
      );
      if (!res.ok) {
        // try fallback if index.json lists a different path
        console.warn(
          "fixed_deposit.json not found at base path, status:",
          res.status
        );
        return;
      }
      const fdData = await res.json();
      renderFixedDepositTable(fdData);
    } catch (err) {
      console.error("Failed to load fd.json:", err);
    }
  }

  // ---- existing functions for charts / sundry / expense (kept intact) ----

  async function renderCharts(monthIndex) {
    clearSections();
    let sundryRowsAll = [],
      expenseRowsAll = [];

    for (const file of files) {
      const filePath = `${RAW_JSON_BASE}/${file}?v=${Date.now()}`;
      let data = [];
      try {
        const res = await fetch(filePath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        allData[file] = data; // cache
      } catch (err) {
        console.error(`Failed to load ${filePath}:`, err);
        continue;
      }
      if (!data || !data.length) continue;

      const chartName = file.replace(".json", "").replace(/_/g, " ");
      const headers = Object.keys(data[0] || {});
      const categoryCol = headers.find((h) =>
        h.toLowerCase().includes("category")
      );
      const subCatCol = headers.find((h) =>
        h.toLowerCase().includes("sub category")
      );
      const amountCol = headers.find((h) => h.toLowerCase().includes("amount"));
      if (!categoryCol || !amountCol) continue;

      const categoryMap = {};
      data.forEach((row) => {
        const dateStr = row["Date"] || row["date"];
        if (!dateStr) return; // we only build charts from rows that have dates
        const d = new Date(dateStr);
        if (isNaN(d)) return;
        if (d.getMonth() !== monthIndex) return;

        const cat = row[categoryCol] || "Other";
        const subCat = subCatCol ? row[subCatCol] || "Other" : "Other";
        const amt = parseAmount(row[amountCol]);

        if (!categoryMap[cat]) categoryMap[cat] = {};
        categoryMap[cat][subCat] = (categoryMap[cat][subCat] || 0) + amt;

        if (
          (row["Category"] || row["category"] || "").toLowerCase() === "sundry"
        )
          sundryRowsAll.push(row);
        if (file.toLowerCase().includes("expense")) expenseRowsAll.push(row);
      });

      // Remove zero totals
      for (const cat in categoryMap) {
        const total = Object.values(categoryMap[cat]).reduce(
          (a, b) => a + b,
          0
        );
        if (total === 0) delete categoryMap[cat];
      }

      const categories = Object.keys(categoryMap);
      if (!categories.length) continue;

      const allSubCats = new Set();
      categories.forEach((cat) =>
        Object.keys(categoryMap[cat]).forEach((sub) => allSubCats.add(sub))
      );

      const datasets = Array.from(allSubCats).map((subCat, i) => ({
        label: subCat,
        data: categories.map((cat) => categoryMap[cat][subCat] || 0),
        backgroundColor: COLORS[i % COLORS.length],
      }));

      // create canvas
      const colDiv = document.createElement("div");
      colDiv.className = "mb-4";
      const canvas = document.createElement("canvas");
      colDiv.appendChild(canvas);

      let targetContainer = inflowContainer;
      if (file.toLowerCase().includes("expense"))
        targetContainer = expenseContainer;
      else if (file.toLowerCase().includes("inflow"))
        targetContainer = inflowContainer;

      if (targetContainer) targetContainer.appendChild(colDiv);

      // draw chart
      try {
        new Chart(canvas, {
          type: "bar",
          data: { labels: categories, datasets: datasets },
          options: {
            responsive: true,
            plugins: {
              legend: { position: "top" },
              title: {
                display: true,
                text: `${chartName} (${monthNames[monthIndex]})`,
              },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    const category =
                      context.chart.data.labels[context.dataIndex];
                    const subCategory = context.dataset.label;
                    const amount = context.raw;
                    if (amount === 0) return null;
                    return `${category} → ${subCategory}: ₹ ${amount.toLocaleString(
                      "en-IN",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}`;
                  },
                },
              },
            },
            scales: {
              x: { stacked: true, title: { display: true, text: "Category" } },
              y: {
                stacked: true,
                beginAtZero: true,
                title: { display: true, text: "Amount" },
                ticks: {
                  callback: (value) => `₹ ${value.toLocaleString("en-IN")}`,
                },
              },
            },
          },
          plugins: [showTotalsPlugin],
        });
      } catch (e) {
        console.warn("Chart render error:", e);
      }
    }

    renderSundryPie(sundryRowsAll, monthIndex);
    renderExpenseTable(expenseRowsAll);
    //renderExpenseMonthSummary();
    renderinflowMonthSummary("inflow");
    renderinflowMonthSummary("expense");
    // always attempt to load FD data for the FD table
    await loadFDData();
  }

  function renderSundryPie(sundryRows, monthIndex) {
    if (!sundryRows || !sundryRows.length) return;
    const subCatMap = {};
    sundryRows.forEach((row) => {
      const subCat = row["Sub Category"] || row["sub category"] || "Other";
      const amt = parseAmount(row["Amount"] || row["amount"]);
      subCatMap[subCat] = (subCatMap[subCat] || 0) + amt;
    });

    const labels = Object.keys(subCatMap);
    const amounts = Object.values(subCatMap);

    const colDiv = document.createElement("div");
    colDiv.className = "mb-4";
    const canvas = document.createElement("canvas");
    colDiv.appendChild(canvas);
    if (sundryContainer) sundryContainer.appendChild(colDiv);

    try {
      new Chart(canvas, {
        type: "pie",
        data: {
          labels: labels,
          datasets: [
            {
              data: amounts,
              backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]),
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "top" },
            title: {
              display: true,
              text: `Sundry (${monthNames[monthIndex]})`,
            },
            tooltip: {
              callbacks: {
                label: (c) =>
                  `${c.label}: ₹ ${c.raw.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`,
              },
            },
          },
        },
      });
    } catch (e) {
      console.warn("Sundry pie error:", e);
    }
  }

  function renderExpenseTable(expenseRows) {
    if (!expenseTableBody) return;
    if (!expenseRows || !expenseRows.length) {
      expenseTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No expense rows</td></tr>`;
      return;
    }
    expenseTableBody.innerHTML = "";
    expenseRows.sort(
      (a, b) =>
        new Date(a["Date"] || a["date"]) - new Date(b["Date"] || b["date"])
    );
    let totalAmount = 0;
    let validRows = 0;

    expenseRows.forEach((row) => {
      const amt = parseAmount(row["Amount"] || row["amount"]);
      const category = (row["Category"] || row["category"] || "")
        .trim()
        .toLowerCase();
      const checked = (row["Checked"] || row["checked"] || "")
        .trim()
        .toLowerCase();
      if (amt === 0) return;
      validRows++;
      if (
        category !== "withdrawal self" &&
        category !== "withdrawl self" &&
        checked === "yes"
      )
        totalAmount += amt;

      const tr = document.createElement("tr");
      tr.classList.add(checked === "yes" ? "table-success" : "table-warning");
      tr.innerHTML = `
        <td>${row["Date"] || row["date"] || ""}</td>
        <td>${row["Category"] || row["category"] || ""}</td>
        <td>${row["Sub Category"] || row["sub category"] || ""}</td>
        <td>${row["Payment To"] || row["payment to"] || ""}</td>
        <td>${row["Mode"] || row["mode"] || ""}</td>
        <td class="text-end">₹ ${amt.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
        })}</td>
      `;
      expenseTableBody.appendChild(tr);
    });

    if (validRows > 0) {
      const totalTr = document.createElement("tr");
      totalTr.classList.add("fw-bold", "table-light");
      totalTr.innerHTML = `
        <td colspan="5" class="text-end">Total (Excl. Withdrawal Self)</td>
        <td class="text-end">₹ ${totalAmount.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
        })}</td>
      `;
      expenseTableBody.appendChild(totalTr);
    }
  }

  function renderinflowMonthSummary(type = "expense") {
    const tbody = document.getElementById(`${type}-month-body`);
    const thead = document.getElementById(`${type}-month-header`);
    const chartContainer = document.getElementById(`${type}-month-chart`);

    if (!tbody || !thead) return;
    tbody.innerHTML = "";
    thead.innerHTML = "<th>Category</th>";
    if (chartContainer) chartContainer.innerHTML = "";

    const monthTotals = {};
    const grandTotals = Array(12).fill(0);

    for (const file of files) {
      if (!file.toLowerCase().includes(`${type}`)) continue;
      const data = allData[file] || [];
      data.forEach((row) => {
        const dateStr = row["Date"] || row["date"];
        const cat = (row["Category"] || row["category"] || "Other").trim();
        const amt = parseAmount(row["Amount"] || row["amount"]);
        const checked = (row["Checked"] || row["checked"] || "")
          .trim()
          .toLowerCase();
        if (!dateStr || amt === 0) return;
        if (type === "expense") {
          if (
            cat.toLowerCase() === "withdrawal self" ||
            cat.toLowerCase() === "withdrawl self" ||
            checked !== "yes"
          )
            return;
        }
        const d = new Date(dateStr);
        if (isNaN(d)) return;
        const monthIndex = d.getMonth();
        if (!monthTotals[cat]) monthTotals[cat] = Array(12).fill(0);
        monthTotals[cat][monthIndex] += amt;
        grandTotals[monthIndex] += amt;
      });
    }

    // Headers
    monthNames.forEach((m) => {
      const th = document.createElement("th");
      th.textContent = m;
      thead.appendChild(th);
    });

    // Body
    for (const cat of Object.keys(monthTotals)) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${cat}</td>` +
        monthTotals[cat]
          .map((v) =>
            v === 0
              ? "<td></td>"
              : `<td>₹ ${v.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}</td>`
          )
          .join("");
      tbody.appendChild(tr);
    }

    // Footer
    const tfoot = tbody.parentElement.querySelector("tfoot tr");
    if (tfoot) {
      tfoot.innerHTML =
        "<th>Grand Total</th>" +
        grandTotals
          .map((v) =>
            v === 0
              ? "<th></th>"
              : `<th>₹ ${v.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}</th>`
          )
          .join("");
    }

    // Chart (optional)
    if (chartContainer) {
      const canvasDiv = document.createElement("div");
      canvasDiv.className = "mb-4";
      const canvas = document.createElement("canvas");
      canvasDiv.appendChild(canvas);
      chartContainer.appendChild(canvasDiv);

      try {
        new Chart(canvas, {
          type: "bar",
          data: {
            labels: monthNames,
            datasets: [
              {
                label: `Total ${type} (₹)`,
                data: grandTotals,
                backgroundColor: "#4e79a7",
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              title: {
                display: true,
                text: `${
                  type.charAt(0).toUpperCase() + type.slice(1)
                }: Monthly Totals`,
              },
              tooltip: {
                callbacks: {
                  label: (c) =>
                    `₹${c.raw.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}`,
                },
              },
              datalabels: {
                anchor: "end",
                align: "end",
                color: "#000",
                font: { weight: "normal", size: 10 },
                formatter: (v) =>
                  v === 0 ? "" : `₹${v.toLocaleString("en-IN")}`,
              },
            },
            scales: {
              x: { title: { display: true, text: "Months" } },
              y: {
                beginAtZero: true,
                title: { display: true, text: "Amount (₹)" },
                ticks: { callback: (v) => `₹${v.toLocaleString("en-IN")}` },
              },
            },
          },
          plugins: [ChartDataLabels],
        });
      } catch (e) {
        console.warn(`{${type}} month chart error:`, e);
      }
    }
  }

function calculateCashInHand(expenses, inflows) {
  const normalize = str => (str || "").toString().trim().toLowerCase();

  // convert "₹2,300.00" → 2300
  const toNumber = val => {
    if (!val) return 0;
    return parseFloat(val.toString().replace(/[₹,]/g, "").trim()) || 0;
  };

  let totalWithdrawals = 0;
  let totalCashExpenses = 0;
  let totalCashInflows = 0;

  // --- Expenses Processing ---
  for (const e of expenses) {
    const category = normalize(e.Category || e.category);
    const mode = normalize(e.Mode || e.mode);
    const amount = toNumber(e.Amount || e.amount);

    if (category === "withdrawl self" || category === "withdrawal self") {
      totalWithdrawals += amount; // cash deposited from bank
    } else if (mode === "cash") {
      totalCashExpenses += amount; // cash spent
    }
  }

  // --- Inflows Processing ---
  for (const i of inflows) {
    const mode = normalize(i.Mode || i.mode);
    const amount = toNumber(i.Amount || i.amount);

    if (mode === "cash") {
      totalCashInflows += amount; // cash received directly
    }
  }

  console.log("Total Withdrawals:", totalWithdrawals);
  console.log("Total Cash Expenses:", totalCashExpenses);
  console.log("Total Cash Inflows:", totalCashInflows);

  return totalWithdrawals + totalCashInflows - totalCashExpenses;
}

  async function fetchData(fileName="expenses") {
    for (const file of files) {
      if (!file.toLowerCase().includes(fileName)) continue;
      const filePath = `${RAW_JSON_BASE}/${file}?v=${Date.now()}`;
      let data = [];
      try {
        const res = await fetch(filePath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        return data; // return the first inflow file found
      } catch (err) {
        console.error(`Failed to load ${filePath}:`, err);
        continue;
      }
    }
    return []; // no inflow data found
  }
  async function loadAndCalculate() {
      const expenses = await fetchData("expenses"); // Fetch expenses data
      const inflows = await fetchData("inflow"); // Fetch inflows data
      const cashInHand = calculateCashInHand(expenses, inflows) - 4565; // Adjusted by ₹4565 as per original logic
      console.log("Cash in Hand: ₹", cashInHand);
      document.getElementById("result").textContent = `Cash in Hand: ₹${cashInHand.toLocaleString("en-IN", {minimumFractionDigits: 2})}`;
  }
  await loadAndCalculate();
  // Initial render
  const currentMonth = new Date().getMonth();
  await renderCharts(currentMonth);
  // safe event listeners (only if elements exist)
  if (monthSelect) {
    monthSelect.addEventListener("change", (e) =>
      renderCharts(parseInt(e.target.value))
    );
  }
  if (periodSelect) {
    periodSelect.addEventListener("change", () =>
      renderCharts(parseInt(monthSelect.value))
    );
  }
});
