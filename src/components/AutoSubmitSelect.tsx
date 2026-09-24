"use client";

interface Option { value: string; label: string }

/** Submit directory filters as soon as a sort order is selected. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: Option[];
}) {
  return (
    <select name={name} defaultValue={defaultValue} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

export function AutoSubmitDate({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return <input type="date" name={name} defaultValue={defaultValue} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
