"use client";

import { useMemo, useState } from "react";

type Order = { reference: string; name: string; phone: string; email: string; quantity: number; amountMinor: number; paymentStatus: string; stayStatus: string; createdAt: string };
const columns = ["Reference", "Order Date", "Customer Name", "Phone Number", "Email Address", "Qty", "Amount Paid", "Order Status"] as const;
type Column = typeof columns[number];
const values = (order: Order): Record<Column, string> => ({ Reference: order.reference, "Order Date": new Date(order.createdAt).toLocaleString(), "Customer Name": order.name, "Phone Number": order.phone, "Email Address": order.email, Qty: String(order.quantity), "Amount Paid": (order.amountMinor / 100).toFixed(2), "Order Status": order.paymentStatus });

export function ApartmentOrdersTable({ orders }: { orders: Order[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<Column>("Order Date");
  const [ascending, setAscending] = useState(false);
  const [selected, setSelected] = useState<Column[]>([...columns]);
  const filtered = useMemo(() => orders.filter((o) => {
    const date = new Date(o.createdAt).toISOString().slice(0, 10);
    return (!from || date >= from) && (!to || date <= to) && (!status || o.paymentStatus === status);
  }).sort((a, b) => {
    const x = values(a)[sort], y = values(b)[sort];
    const cmp = sort === "Order Date" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : sort === "Qty" || sort === "Amount Paid" ? Number(x) - Number(y) : x.localeCompare(y);
    return ascending ? cmp : -cmp;
  }), [orders, from, to, status, sort, ascending]);
  function toggleSort(column: Column) { if (column === sort) setAscending(!ascending); else { setSort(column); setAscending(true); } }
  function exportCsv() {
    const rows = [selected, ...filtered.map((order) => selected.map((column) => values(order)[column]))];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "apartment-orders.csv"; link.click(); URL.revokeObjectURL(url);
  }
  return <>
    <div className="order-filter-row">
      <label className="field"><span>Order date from</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="field"><span>Order date to</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label className="field"><span>Order status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{[...new Set(orders.map((o) => o.paymentStatus))].map((value) => <option key={value}>{value}</option>)}</select></label>
      <button className="btn secondary" type="button" onClick={() => { setFrom(""); setTo(""); setStatus(""); }}>Reset filters</button>
    </div>
    <details className="order-export-options"><summary>Choose export columns</summary><div>{columns.map((column) => <label key={column}><input type="checkbox" checked={selected.includes(column)} onChange={() => setSelected((current) => current.includes(column) ? current.filter((item) => item !== column) : columns.filter((item) => item === column || current.includes(item)))} />{column}</label>)}</div></details>
    <button className="btn secondary" type="button" disabled={!selected.length} onClick={exportCsv}>Export selected columns</button>
    {filtered.length ? <div className="table-scroll"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}><button className="table-sort-button" type="button" onClick={() => toggleSort(column)}>{column}{sort === column ? (ascending ? " ↑" : " ↓") : ""}</button></th>)}</tr></thead><tbody>{filtered.map((order) => <tr key={order.reference}><td>{order.reference}</td><td>{new Date(order.createdAt).toLocaleString()}</td><td>{order.name}</td><td>{order.phone}</td><td>{order.email}</td><td>{order.quantity}</td><td>₦{(order.amountMinor / 100).toLocaleString()}</td><td>{order.paymentStatus}</td></tr>)}</tbody></table></div> : <p>No orders match these filters.</p>}
  </>;
}
