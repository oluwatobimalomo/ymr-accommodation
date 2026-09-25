"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/Badge";
import { ImageCarousel } from "@/components/ImageCarousel";
import { formatNaira } from "@/lib/format-currency";
import { formatStayRange } from "@/lib/format-date";

export interface ApartmentListing {
  id: string;
  name: string;
  mode: "PRIVATE" | "SHARED";
  pricingModel: "PER_UNIT" | "PER_PERSON";
  defaultPriceMinor: number;
  genderRestriction: "ANY" | "MALE" | "FEMALE";
  customerSelectsBedspace: boolean;
  checkInDate: string | null;
  checkOutDate: string | null;
  images: string[];
  image?: string;
  facilities: string[];
  overviewFacilities: string[];
  bedTypes: string[];
  bedSizes: string[];
  bedSpecifications: string[];
  bedspaceOptions: Array<{ id: string; roomName: string; letter: string; genderRestriction: string; status: "AVAILABLE" | "OCCUPIED" | "HELD" | "BLOCKED" | "MAINTENANCE" | "RETIRED" }>;
  availableStock: number;
  totalStock: number;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
}

interface CartItem { categoryId: string; name: string; priceMinor: number; pricingModel: string; mode: "PRIVATE" | "SHARED"; customerSelectsBedspace?: boolean; quantity: number; availableStock?: number; maxOrderQuantity?: number | null; bedspaceIds?: string[]; bedspaceLabels?: Array<{ letter: string; roomName: string }>; }
interface Guest { name: string; gender: "" | "MALE" | "FEMALE"; }
const BAG_KEY = "ymr-accommodation-bag-v1";

export function ApartmentBrowser({ apartments, lodgeName }: { apartments: ApartmentListing[]; lodgeName: string }) {
  const [selected, setSelected] = useState<ApartmentListing | null>(null);
  const [selectedBeds, setSelectedBeds] = useState<Record<string, string[]>>({});
  const [bag, setBag] = useState<CartItem[]>([]);
  const [bagReady, setBagReady] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [bookerName, setBookerName] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [giftBooking, setGiftBooking] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [guestsByCategory, setGuestsByCategory] = useState<Record<string, Guest[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const getGuests = (item: CartItem) => guestsByCategory[item.categoryId] ?? Array.from({ length: item.quantity || item.bedspaceIds?.length || 1 }, () => ({ name: bookerName, gender: "" as const }));
  const itemAmount = (item: CartItem) => item.priceMinor * item.quantity;
  const total = useMemo(() => bag.reduce((sum, item) => sum + itemAmount(item), 0), [bag, guestsByCategory]);
  const needsBedspaceSelection = selected?.mode === "SHARED" && selected.customerSelectsBedspace;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BAG_KEY) ?? "[]") as Array<Partial<CartItem> & Pick<CartItem, "categoryId" | "name" | "priceMinor" | "pricingModel" | "mode">>;
      setBag(saved.map((item) => {
        const listing = apartments.find((apartment) => apartment.id === item.categoryId);
        const storedLabels = item.bedspaceLabels ?? item.bedspaceIds?.map((id) => {
          const option = listing?.bedspaceOptions.find((bedspace) => bedspace.id === id);
          return option ? { letter: option.letter, roomName: option.roomName } : undefined;
        }).filter((label): label is { letter: string; roomName: string } => label !== undefined);
        return { ...item, bedspaceLabels: storedLabels, quantity: item.quantity ?? (item.bedspaceIds?.length || 1) };
      }) as CartItem[]);
    } catch { setBag([]); }
    setBagReady(true);
  }, []);
  useEffect(() => { if (bagReady) try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); window.dispatchEvent(new Event("ymr-bag-updated")); } catch { /* The bag still works for this page view. */ } }, [bag, bagReady]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  function addToBag(apartment: ApartmentListing) {
    const bedspaceIds = selectedBeds[apartment.id] ?? [];
    if (apartment.mode === "SHARED" && apartment.customerSelectsBedspace && bedspaceIds.length === 0) {
      setError("Choose at least one available bedspace to add this apartment to your bag.");
      return;
    }
    const currentQuantity = bag.find((item) => item.categoryId === apartment.id)?.quantity ?? 0;
    const adding = apartment.mode === "SHARED" ? bedspaceIds.length || 1 : 1;
    const cap = Math.min(apartment.availableStock, apartment.maxOrderQuantity ?? Number.POSITIVE_INFINITY);
    if (currentQuantity + adding > cap) { setError(cap === 0 ? "No units are currently available in this apartment." : `You can add up to ${cap} unit${cap === 1 ? "" : "s"} of this apartment.`); return; }
    if (currentQuantity + adding < apartment.minOrderQuantity && apartment.mode === "SHARED") { setError(`Choose at least ${apartment.minOrderQuantity} bedspaces to add this apartment.`); return; }
    setError("");
    setSelectedBeds((current) => ({ ...current, [apartment.id]: [] }));
    const selectedBedspaces = bedspaceIds.map((id) => apartment.bedspaceOptions.find((option) => option.id === id)).filter((option) => option !== undefined).map((option) => ({ letter: option.letter, roomName: option.roomName }));
    setBag((current) => {
      const existing = current.find((item) => item.categoryId === apartment.id);
      if (existing) return current.map((item) => item.categoryId !== apartment.id ? item : item.mode === "SHARED" && apartment.customerSelectsBedspace
        ? { ...item, quantity: item.quantity + bedspaceIds.length, bedspaceIds: [...(item.bedspaceIds ?? []), ...bedspaceIds], bedspaceLabels: [...(item.bedspaceLabels ?? []), ...selectedBedspaces] }
        : { ...item, quantity: item.quantity + 1 });
      return [...current, {
      categoryId: apartment.id, name: apartment.name, priceMinor: apartment.defaultPriceMinor,
      pricingModel: apartment.pricingModel, mode: apartment.mode, customerSelectsBedspace: apartment.customerSelectsBedspace, quantity: apartment.mode === "SHARED" ? bedspaceIds.length || 1 : 1, availableStock: apartment.availableStock, maxOrderQuantity: apartment.maxOrderQuantity,
      ...(bedspaceIds.length ? { bedspaceIds, bedspaceLabels: selectedBedspaces } : {}),
    }];
    });
    setSelected(null);
    setBagOpen(true);
  }

  function updateGuests(categoryId: string, guests: Guest[]) {
    setGuestsByCategory((current) => ({ ...current, [categoryId]: guests }));
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const items = bag.flatMap((item) => Array.from({ length: item.quantity }, (_, index) => ({
        categoryId: item.categoryId,
        occupants: [{ name: giftBooking ? recipientName : bookerName, phone: giftBooking ? recipientPhone : bookerPhone, email: giftBooking ? recipientEmail : bookerEmail, gender: item.mode === "PRIVATE" ? "UNSPECIFIED" as const : getGuests(item)[index]?.gender as "MALE" | "FEMALE", bedspaceId: item.bedspaceIds?.[index] }],
      })));
      const response = await fetch("/api/booking/create-cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookerName, bookerPhone, bookerEmail, items, ...(giftBooking ? { giftRecipientName: recipientName, giftRecipientPhone: recipientPhone, giftRecipientEmail: recipientEmail } : {}) }) });
      const result = await response.json() as { error?: string; redirectUrl?: string };
      if (!response.ok) throw new Error(result.error ?? "We could not start checkout.");
      window.location.assign(result.redirectUrl!);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not start checkout.");
      setBusy(false);
    }
  }

  return <>
    <div className="apartment-browser-tools">
      <p>{apartments.length} apartment{apartments.length === 1 ? "" : "s"} at {lodgeName}</p>
      <button type="button" className="btn secondary bag-toggle" onClick={() => setBagOpen(true)} aria-label={`Open bag, ${bag.reduce((sum, item) => sum + item.quantity, 0)} items`}>
        <span aria-hidden="true">▱</span> Bag <span className="bag-count">{bag.reduce((sum, item) => sum + item.quantity, 0)}</span>
      </button>
    </div>
    <div className="grid accommodation-listing-grid">
      {apartments.map((apartment) => {
        const overview = apartment.overviewFacilities;
        return <article key={apartment.id} className="listing-card apartment-listing-card">
          <div role="button" tabIndex={0} className="apartment-photo-button" aria-label={`View ${apartment.name} details`} onClick={() => setSelected(apartment)} onKeyDown={(event) => { if (event.currentTarget === event.target && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelected(apartment); } }}>
            <ImageCarousel images={apartment.images.length ? apartment.images : apartment.image ? [apartment.image] : []} alt={apartment.name} />
          </div>
          <div className="listing-body">
            <div className="apartment-card-heading"><h3>{apartment.name}</h3><Badge tone="brand">{apartment.mode === "PRIVATE" ? "Private" : "Shared"}</Badge></div>
            {apartment.genderRestriction !== "ANY" && <Badge tone="navy">{apartment.genderRestriction === "MALE" ? "Male only" : "Female only"}</Badge>}
            {overview.length > 0 && <p className="listing-meta overview-amenities"><strong>Some amenities:</strong> {overview.map(expandAmenity).join(", ")}</p>}
            {(apartment.bedTypes.length > 0 || apartment.bedSizes.length > 0 || apartment.bedSpecifications.length > 0) && <p className="listing-meta"><strong>{[...apartment.bedTypes, ...apartment.bedSpecifications.filter((spec) => /single|double|bunk/i.test(spec))].filter((v, i, a) => a.indexOf(v) === i).join(", ") || "Beds"}</strong>{apartment.bedSizes.length > 0 ? ` · ${apartment.bedSizes.join(", ")}` : apartment.bedSpecifications.filter((spec) => /\d+x\d+/i.test(spec)).join(", ")}</p>}
            {formatStayRange(apartment.checkInDate, apartment.checkOutDate) && <p className="stay-date-line">{formatStayRange(apartment.checkInDate, apartment.checkOutDate)}</p>}
            <div className="apartment-card-bottom"><p className="listing-price"><strong>{formatNaira(apartment.defaultPriceMinor)}</strong><span className="price-unit">{apartment.pricingModel === "PER_PERSON" ? "per guest" : "per apartment"}</span></p><button type="button" className="btn secondary" onClick={() => setSelected(apartment)}>View details</button></div>
          </div>
        </article>;
      })}
    </div>

    <dialog ref={dialogRef} className={`apartment-detail-dialog${needsBedspaceSelection ? " has-bedspace-selection" : ""}${selected?.mode === "PRIVATE" ? " is-private-apartment" : ""}`} onCancel={(event) => { event.preventDefault(); setSelected(null); }}>
      {selected && <>
        <button className="dialog-close" type="button" aria-label="Close apartment details" onClick={() => setSelected(null)}>×</button>
        <div className="apartment-detail-layout">
          <div className="apartment-detail-photo"><ImageCarousel images={selected.images.length ? selected.images : selected.image ? [selected.image] : []} alt={selected.name} /></div>
          <div className="apartment-detail-copy">
            <span className="eyebrow">{lodgeName}</span><h2>{selected.name}</h2>
            <div className="badge-row"><Badge tone="brand">{selected.mode === "PRIVATE" ? "Private" : "Shared"}</Badge>{selected.genderRestriction !== "ANY" && <Badge>{selected.genderRestriction === "MALE" ? "Male only" : "Female only"}</Badge>}</div>
            {formatStayRange(selected.checkInDate, selected.checkOutDate) && <p className="stay-date-line">{formatStayRange(selected.checkInDate, selected.checkOutDate)}</p>}
            {selected.bedTypes.length + selected.bedSizes.length > 0 && <section><h3>Beds</h3><p><strong>{selected.bedTypes.join(", ")}</strong>{selected.bedSizes.length > 0 ? ` · ${selected.bedSizes.join(", ")}` : ""}</p></section>}
            <section><h3>All amenities</h3>{selected.facilities.length ? <ul className="amenity-list">{selected.facilities.map((amenity) => <li key={amenity}>{expandAmenity(amenity)}</li>)}</ul> : <p>Contact the lodge for amenity details.</p>}</section>
            {needsBedspaceSelection && <><div className="detail-price"><strong>{formatNaira(selected.defaultPriceMinor)}</strong><span>{selected.pricingModel === "PER_PERSON" ? "per guest for this stay" : "per apartment for this stay"}</span></div><button className="btn bedspace-add-action" type="button" disabled={!(selectedBeds[selected.id]?.length) || selected.bedspaceOptions.length === 0} onClick={() => addToBag(selected)}>{bag.some((item) => item.categoryId === selected.id) ? "Add another" : "Add to bag"}</button></>}
            {selected.mode === "SHARED" && selected.customerSelectsBedspace && <fieldset className="bedspace-pick-list"><legend>Choose bedspaces</legend>{selected.bedspaceOptions.length ? <BedspaceSeatMap key={selected.id} options={selected.bedspaceOptions} selectedIds={selectedBeds[selected.id] ?? []} onToggle={(id) => setSelectedBeds((current) => ({ ...current, [selected.id]: (current[selected.id] ?? []).includes(id) ? (current[selected.id] ?? []).filter((selectedId) => selectedId !== id) : [...(current[selected.id] ?? []), id] }))} /> : <p>No bedspaces are available right now.</p>}</fieldset>}
            {!needsBedspaceSelection && <><div className="detail-price"><strong>{formatNaira(selected.defaultPriceMinor)}</strong><span>{selected.pricingModel === "PER_PERSON" ? "per guest for this stay" : "per apartment for this stay"}</span></div><button className="btn" type="button" disabled={selected.availableStock === 0} onClick={() => addToBag(selected)}>{selected.availableStock === 0 ? "Sold out" : bag.some((item) => item.categoryId === selected.id) ? "Add another" : "Add to bag"}</button></>}
          </div>
        </div>
      </>}
    </dialog>

    {bagOpen && <div className="bag-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setBagOpen(false); setCheckout(false); } }}>
      <aside className="bag-drawer" role="dialog" aria-modal="true" aria-labelledby="bag-title">
        <header><div><span className="eyebrow">Your selection</span><h2 id="bag-title">{checkout ? "Checkout" : "Your bag"}</h2></div><button type="button" className="dialog-close" aria-label="Close bag" onClick={() => { setBagOpen(false); setCheckout(false); }}>×</button></header>
        {bag.length === 0 ? <div className="bag-empty"><p>Your bag is empty.</p><button className="btn" type="button" onClick={() => setBagOpen(false)}>Keep shopping</button></div> : checkout ? <form className="stack bag-checkout-form" onSubmit={submitCheckout}>
          <p>One payment covers {bag.reduce((sum, item) => sum + item.quantity, 0)} accommodation item{bag.reduce((sum, item) => sum + item.quantity, 0) === 1 ? "" : "s"}.</p>
          <label className="field"><span>Your name</span><input required value={bookerName} onChange={(event) => setBookerName(event.target.value)} autoComplete="name" /></label>
          <label className="field"><span>Phone number</span><input required type="tel" value={bookerPhone} onChange={(event) => setBookerPhone(event.target.value)} autoComplete="tel" /></label>
          <label className="field"><span>Email</span><input required type="email" value={bookerEmail} onChange={(event) => setBookerEmail(event.target.value)} autoComplete="email" /></label>
          <label className="gift-booking-toggle"><input type="checkbox" checked={giftBooking} onChange={(event) => setGiftBooking(event.target.checked)} /><span><strong>Gift this to someone</strong><small>Recipient will receive the gift in their mailbox.</small></span></label>
          {giftBooking && <fieldset className="bag-guest-group"><legend>Recipient details</legend><label className="field"><span>Recipient name</span><input required value={recipientName} onChange={(event) => setRecipientName(event.target.value)} autoComplete="name" /></label><label className="field"><span>Recipient phone number</span><input required type="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} autoComplete="tel" /></label><label className="field"><span>Recipient email</span><input required type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} autoComplete="email" /></label></fieldset>}
          {bag.filter((item) => item.mode === "SHARED").map((item) => <fieldset className="bag-guest-group" key={item.categoryId}><legend>{item.name} · Shared space gender</legend>{!giftBooking && <p>Choose your gender so we can check it against the selected room.</p>}{Array.from({ length: item.quantity }, (_, unitIndex) => <label className="field" key={unitIndex}><span>{item.bedspaceIds?.[unitIndex] ? `BDS ${item.bedspaceLabels?.[unitIndex]?.letter ?? apartments.find((apartment) => apartment.id === item.categoryId)?.bedspaceOptions.find((bedspace) => bedspace.id === item.bedspaceIds?.[unitIndex])?.letter ?? "—"}` : `Space ${unitIndex + 1}`} · {giftBooking ? "Recipient gender" : "Your gender"}</span><select required value={getGuests(item)[unitIndex]?.gender ?? ""} onChange={(event) => { const guests = [...getGuests(item)]; guests[unitIndex] = { ...(guests[unitIndex] ?? { name: giftBooking ? recipientName : bookerName, gender: "" }), gender: event.target.value as Guest["gender"] }; updateGuests(item.categoryId, guests); }}><option value="">Choose gender</option><option value="FEMALE">Female</option><option value="MALE">Male</option></select></label>)}</fieldset>)}
          {error && <div className="alert" role="alert">{error}</div>}
          <div className="bag-total"><span>Total</span><strong>{formatNaira(total)}</strong></div>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Preparing checkout…" : "Continue to payment"}</button>
          <button type="button" className="btn secondary" onClick={() => setCheckout(false)}>Back to bag</button>
        </form> : <>
          <div className="bag-items">{bag.map((item) => <article className="bag-item" key={item.categoryId}><div><strong>{item.name} × {item.quantity}</strong><span>{formatNaira(itemAmount(item))}</span>{item.bedspaceLabels?.length ? <span>{item.bedspaceLabels.map((bedspace) => `BDS ${bedspace.letter}`).join(", ")}</span> : null}<div className="bag-quantity"><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1} onClick={() => setBag((current) => current.map((entry) => entry.categoryId === item.categoryId ? { ...entry, quantity: entry.quantity - 1, bedspaceIds: entry.bedspaceIds?.slice(0, -1), bedspaceLabels: entry.bedspaceLabels?.slice(0, -1) } : entry))}>−</button><span>Quantity {item.quantity}</span>{(!item.customerSelectsBedspace || item.mode === "PRIVATE") && <button type="button" aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= Math.min(item.availableStock ?? Number.POSITIVE_INFINITY, item.maxOrderQuantity ?? Number.POSITIVE_INFINITY)} onClick={() => setBag((current) => current.map((entry) => entry.categoryId === item.categoryId ? { ...entry, quantity: entry.quantity + 1 } : entry))}>+</button>}</div></div><button className="text-button remove-bag-item" type="button" onClick={() => setBag((current) => current.filter((entry) => entry.categoryId !== item.categoryId))}>Remove</button></article>)}</div>
          <div className="bag-total"><span>Total</span><strong>{formatNaira(total)}</strong></div>
          <div className="bag-actions"><button type="button" className="btn" onClick={() => setCheckout(true)}>Checkout</button><button type="button" className="btn secondary" onClick={() => setBagOpen(false)}>Keep shopping</button></div>
        </>}
      </aside>
    </div>}
  </>;
}

function expandAmenity(name: string) {
  return name.trim().toLowerCase() === "ac" ? "Air Conditioner" : name.replace(/\bac\b/gi, "Air Conditioner");
}

type BedspaceOption = ApartmentListing["bedspaceOptions"][number];
function BedspaceSeatMap({ options, selectedIds, onToggle }: { options: BedspaceOption[]; selectedIds: string[]; onToggle: (id: string) => void }) {
  const [roomSearch, setRoomSearch] = useState("");
  const roomNames = [...new Set(options.map((option) => option.roomName))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const visibleRoomNames = roomNames.filter((name) => name.toLocaleLowerCase().includes(roomSearch.trim().toLocaleLowerCase()));
  return <>
    {roomNames.length > 1 && <label className="bedspace-room-search"><span className="sr-only">Search rooms</span><input type="search" value={roomSearch} onChange={(event) => setRoomSearch(event.target.value)} placeholder="Search rooms…" /><span>{visibleRoomNames.length} of {roomNames.length} rooms</span></label>}
    {visibleRoomNames.length === 0 ? <p className="empty-state">No rooms match “{roomSearch}”.</p> : <div className="bedspace-room-list">{visibleRoomNames.map((roomName) => <section className="bedspace-room" key={roomName}><strong>{roomName}</strong><div className="bedspace-seat-grid">{options.filter((option) => option.roomName === roomName).sort((a, b) => a.letter.localeCompare(b.letter, undefined, { numeric: true, sensitivity: "base" })).map((option) => {
    const isAvailable = option.status === "AVAILABLE";
    const isSelected = selectedIds.includes(option.id);
    const stateText = option.status === "HELD" ? "On hold" : option.status === "OCCUPIED" ? "Occupied" : isAvailable ? "Available" : "Unavailable";
    return <button key={option.id} type="button" className={`bedspace-seat${isSelected ? " is-selected" : ""}${!isAvailable ? " is-unavailable" : ""}`} disabled={!isAvailable} aria-pressed={isSelected} onClick={() => onToggle(option.id)}><strong>BDS {option.letter}</strong><span>{stateText}</span></button>;
  })}</div></section>)}</div>}
  </>;
}
