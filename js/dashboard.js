document.addEventListener("DOMContentLoaded", async () => {
  const inflowContainer = document.getElementById("inflow-charts");
  const expenseContainer = document.getElementById("expense-charts");
  const sundryContainer = document.getElementById("sundry-charts");
  const monthSelect = document.getElementById("monthSelect");
  const periodSelect = document.getElementById("periodSelect");
  const expenseTableBody = document.querySelector("#expense-table tbody");

  const RAW_JSON_BASE = "https://raw.githubusercontent.com/alacrityhsgsociety-arch/alacrityhsgsociety-arch.github.io/refs/heads/main/data";
  const INDEX_FILE = `${RAW_JSON_BASE}/index.json?v=${Date.now()}`;

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const COLORS = ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f",
                  "#edc948","#b07aa1","#ff9da7","#9c755f","#bab0ac"];

  const allData = {};

  // Populate month dropdown
  monthNames.forEach((name,index)=>{
    const option=document.createElement("option");
    option.value=index;
    option.textContent=name;
    if(index===new Date().getMonth()) option.selected=true;
    monthSelect.appendChild(option);
  });

  // Fetch index.json with cache-busting
  let files = [];
  try{
    const res = await fetch(INDEX_FILE);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    files = await res.json();
  } catch(err){
    console.error("Failed to load index.json:", err);
    inflowContainer.innerHTML = `<p class="text-danger">Failed to load data.</p>`;
    return;
  }

  const parseAmount = (value) => {
    if(!value) return 0;
    if(typeof value === "string"){
      value = value.replace(/[₹,]/g,"");
      return parseFloat(value)||0;
    }
    return value;
  };

  const clearSections = () => {
    inflowContainer.innerHTML = "";
    expenseContainer.innerHTML = "";
    sundryContainer.innerHTML = "";
    expenseTableBody.innerHTML = "";
  };

  // Plugin to show totals above stacked bars
  const showTotalsPlugin = {
    id: "showTotals",
    afterDatasetsDraw(chart){
      const {ctx, scales:{x,y}} = chart;
      ctx.save();
      chart.data.labels.forEach((label,index)=>{
        let total=0;
        chart.data.datasets.forEach(ds=> total += ds.data[index]||0);
        if(total>0){
          const xPos=x.getPixelForValue(index);
          const yPos=y.getPixelForValue(total);
          ctx.fillStyle="#000";
          ctx.font="bold 10px sans-serif";
          ctx.textAlign="center";
          ctx.fillText(`₹${total.toLocaleString("en-IN",{maximumFractionDigits:0})}`, xPos, yPos-5);
        }
      });
      ctx.restore();
    }
  };

  async function renderCharts(monthIndex){
    clearSections();
    let sundryRowsAll = [], expenseRowsAll = [];

    for(const file of files){
      const filePath = `${RAW_JSON_BASE}/${file}?v=${Date.now()}`;
      let data = [];
      try{
        const res = await fetch(filePath);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        allData[file] = data; // cache
      } catch(err){
        console.error(`Failed to load ${filePath}:`, err);
        continue;
      }
      if(!data.length) continue;

      const chartName = file.replace(".json","").replace(/_/g," ");
      const headers = Object.keys(data[0]);
      const categoryCol = headers.find(h=>h.toLowerCase().includes("category"));
      const subCatCol = headers.find(h=>h.toLowerCase().includes("sub category"));
      const amountCol = headers.find(h=>h.toLowerCase().includes("amount"));
      if(!categoryCol || !amountCol) continue;

      const categoryMap = {};
      data.forEach(row=>{
        const dateStr = row["Date"]||row["date"];
        if(!dateStr) return;
        const d = new Date(dateStr);
        if(d.getMonth()!==monthIndex) return;

        const cat = row[categoryCol] || "Other";
        const subCat = subCatCol ? row[subCatCol] || "Other" : "Other";
        const amt = parseAmount(row[amountCol]);

        if(!categoryMap[cat]) categoryMap[cat] = {};
        categoryMap[cat][subCat] = (categoryMap[cat][subCat]||0) + amt;

        if((row["Category"]||row["category"]||"").toLowerCase()==="sundry") sundryRowsAll.push(row);
        if(file.toLowerCase().includes("expense")) expenseRowsAll.push(row);
      });

      // Remove zero totals
      for(const cat in categoryMap){
        const total = Object.values(categoryMap[cat]).reduce((a,b)=>a+b,0);
        if(total===0) delete categoryMap[cat];
      }

      const categories = Object.keys(categoryMap);
      if(!categories.length) continue;

      const allSubCats = new Set();
      categories.forEach(cat=>Object.keys(categoryMap[cat]).forEach(sub=>allSubCats.add(sub)));

      const datasets = Array.from(allSubCats).map((subCat,i)=>({
        label: subCat,
        data: categories.map(cat=>categoryMap[cat][subCat]||0),
        backgroundColor: COLORS[i%COLORS.length]
      }));

      const colDiv = document.createElement("div");
      colDiv.className = "mb-4";
      const canvas = document.createElement("canvas");
      colDiv.appendChild(canvas);

      let targetContainer = inflowContainer;
      if(file.toLowerCase().includes("expense")) targetContainer = expenseContainer;
      else if(file.toLowerCase().includes("inflow")) targetContainer = inflowContainer;

      targetContainer.appendChild(colDiv);

      new Chart(canvas,{
        type:"bar",
        data:{labels:categories,datasets:datasets},
        options:{
          responsive:true,
          plugins:{
            legend:{position:"top"},
            title:{display:true,text:`${chartName} (${monthNames[monthIndex]})`},
            tooltip:{
              callbacks:{
                label:function(context){
                  const category=context.chart.data.labels[context.dataIndex];
                  const subCategory=context.dataset.label;
                  const amount=context.raw;
                  if(amount===0) return null;
                  return `${category} → ${subCategory}: ₹ ${amount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                }
              }
            }
          },
          scales:{
            x:{stacked:true,title:{display:true,text:"Category"}},
            y:{stacked:true,beginAtZero:true,title:{display:true,text:"Amount"},
               ticks:{callback:value=>`₹ ${value.toLocaleString("en-IN")}`}}
          }
        },
        plugins:[showTotalsPlugin]
      });
    }

    renderSundryPie(sundryRowsAll,monthIndex);
    renderExpenseTable(expenseRowsAll);
    renderExpenseMonthSummary();
  }

  function renderSundryPie(sundryRows,monthIndex){
    if(!sundryRows.length) return;
    const subCatMap={};
    sundryRows.forEach(row=>{
      const subCat=row["Sub Category"]||row["sub category"]||"Other";
      const amt=parseAmount(row["Amount"]||row["amount"]);
      subCatMap[subCat]=(subCatMap[subCat]||0)+amt;
    });

    const labels=Object.keys(subCatMap);
    const amounts=Object.values(subCatMap);

    const colDiv=document.createElement("div");
    colDiv.className="mb-4";
    const canvas=document.createElement("canvas");
    colDiv.appendChild(canvas);
    sundryContainer.appendChild(colDiv);

    new Chart(canvas,{
      type:"pie",
      data:{labels:labels,datasets:[{data:amounts,backgroundColor:labels.map((_,i)=>COLORS[i%COLORS.length])}]},
      options:{
        responsive:true,
        plugins:{
          legend:{position:"top"},
          title:{display:true,text:`Sundry (${monthNames[monthIndex]})`},
          tooltip:{callbacks:{label:c=>`${c.label}: ₹ ${c.raw.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`}}
        }
      }
    });
  }

  function renderExpenseTable(expenseRows){
    if(!expenseRows.length) return;
    expenseTableBody.innerHTML = "";
    expenseRows.sort((a,b)=>new Date(a["Date"]||a["date"])-new Date(b["Date"]||b["date"]));
    let totalAmount=0;
    let validRows=0;

    expenseRows.forEach(row=>{
      const amt=parseAmount(row["Amount"]||row["amount"]);
      const category=(row["Category"]||row["category"]||"").trim().toLowerCase();
      const checked=(row["Checked"]||row["checked"]||"").trim().toLowerCase();
      if(amt===0) return;
      validRows++;
      if(category!=="withdrawal self" && category!=="withdrawl self" && checked==="yes") totalAmount+=amt;

      const tr=document.createElement("tr");
      tr.classList.add(checked==="yes"?"table-success":"table-warning");
      tr.innerHTML=`
        <td>${row["Date"]||row["date"]||""}</td>
        <td>${row["Category"]||row["category"]||""}</td>
        <td>${row["Sub Category"]||row["sub category"]||""}</td>
        <td>${row["Payment To"]||row["payment to"]||""}</td>
        <td>${row["Mode"]||row["mode"]||""}</td>
        <td class="text-end">₹ ${amt.toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
      `;
      expenseTableBody.appendChild(tr);
    });

    if(validRows>0){
      const totalTr=document.createElement("tr");
      totalTr.classList.add("fw-bold","table-light");
      totalTr.innerHTML=`
        <td colspan="5" class="text-end">Total (Excl. Withdrawal Self)</td>
        <td class="text-end">₹ ${totalAmount.toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
      `;
      expenseTableBody.appendChild(totalTr);
    }
  }

  function renderExpenseMonthSummary(){
    const tbody=document.getElementById("expense-month-body");
    const thead=document.getElementById("expense-month-header");
    const chartContainer=document.getElementById("expense-month-chart");

    tbody.innerHTML = "";
    thead.innerHTML = "<th>Category</th>";
    chartContainer.innerHTML = "";

    const monthTotals = {};
    const grandTotals = Array(12).fill(0);

    for(const file of files){
      if(!file.toLowerCase().includes("expense")) continue;
      const data=allData[file]||[];
      data.forEach(row=>{
        const dateStr=row["Date"]||row["date"];
        const cat=(row["Category"]||row["category"]||"Other").trim();
        const amt=parseAmount(row["Amount"]||row["amount"]);
        const checked=(row["Checked"]||row["checked"]||"").trim().toLowerCase();
        if(!dateStr||amt===0) return;
        if(cat.toLowerCase()==="withdrawal self"||cat.toLowerCase()==="withdrawl self" || checked!=="yes") return;
        const monthIndex=new Date(dateStr).getMonth();
        if(!monthTotals[cat]) monthTotals[cat]=Array(12).fill(0);
        monthTotals[cat][monthIndex]+=amt;
        grandTotals[monthIndex]+=amt;
      });
    }

    // Headers
    monthNames.forEach(m=>{
      const th=document.createElement("th");
      th.textContent=m;
      thead.appendChild(th);
    });

    // Body
    for(const cat of Object.keys(monthTotals)){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${cat}</td>`+monthTotals[cat].map(v=>v===0?"<td></td>":`<td>₹ ${v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>`).join("");
      tbody.appendChild(tr);
    }

    // Footer
    const tfoot=tbody.parentElement.querySelector("tfoot tr");
    tfoot.innerHTML="<th>Grand Total</th>"+grandTotals.map(v=>v===0?"<th></th>":`<th>₹ ${v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</th>`).join("");

    // Chart
    const canvasDiv=document.createElement("div");
    canvasDiv.className="mb-4";
    const canvas=document.createElement("canvas");
    canvasDiv.appendChild(canvas);
    chartContainer.appendChild(canvasDiv);

    new Chart(canvas,{
      type:"bar",
      data:{labels:monthNames,datasets:[{label:"Total Expense (₹)",data:grandTotals,backgroundColor:"#4e79a7"}]},
      options:{
        responsive:true,
        plugins:{
          legend:{display:false},
          title:{display:true,text:"Expense: Monthly Totals"},
          tooltip:{callbacks:{label:c=>`₹${c.raw.toLocaleString("en-IN",{minimumFractionDigits:2})}`}},
          datalabels:{anchor:"end",align:"end",color:"#000",font:{weight:"normal",size:10},formatter:v=>v===0?"":`₹${v.toLocaleString("en-IN")}`}
        },
        scales:{x:{title:{display:true,text:"Months"}},y:{beginAtZero:true,title:{display:true,text:"Amount (₹)"},ticks:{callback:v=>`₹${v.toLocaleString("en-IN")}`}}}
      },
      plugins:[ChartDataLabels]
    });
  }

  // Initial render
  const currentMonth = new Date().getMonth();
  await renderCharts(currentMonth);

  monthSelect.addEventListener("change", e => renderCharts(parseInt(e.target.value)));
  periodSelect.addEventListener("change", ()=>renderCharts(parseInt(monthSelect.value)));
});
