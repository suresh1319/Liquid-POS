// Liquid-POS/js/components/employees/EmployeeToolbar.js
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { EMPLOYEE_ROLES } from "../../models/EmployeeRoles.js";

function EmployeeToolbar({ initialQuery, onQueryChange, onAdd, roleFilter = 'All', onRoleChange, onOpenPanel }) {
  const [localQuery, setLocalQuery] = useState(initialQuery || "");
  const debounceRef = useRef(null);

  useEffect(() => {
    setLocalQuery(initialQuery || "");
  }, [initialQuery]);

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setLocalQuery(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onQueryChange(val);
      }, 250);
    },
    [onQueryChange]
  );

  const clear = useCallback(() => {
    setLocalQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onQueryChange("");
  }, [onQueryChange]);

  return (
    <div className="flex justify-between items-center mb-6">
      <div className="flex-1 mr-4">
        <div className="flex items-center bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
          <div className="flex-1 relative">
            <i className="ph ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={localQuery}
              onChange={handleChange}
              placeholder="Search by name, email or phone"
              className="w-full pl-12 pr-4 py-3 border-none focus:outline-none text-gray-700"
            />
          </div>
          {localQuery && (
            <button
              className="pr-4 pl-2 hover:text-gray-700"
              onClick={clear}
            >
              <i className="ph ph-x text-gray-500" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => onRoleChange && onRoleChange(e.target.value)}
            className="border border-gray-200 bg-white rounded-lg py-2.5 pl-3 pr-8 text-gray-700 hover:border-gray-300 focus:outline-none"
            style={{
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23718096\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            <option value="All">All Roles</option>
            {EMPLOYEE_ROLES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        {onOpenPanel && (
          <button
            onClick={onOpenPanel}
            className="px-3 py-2 bg-gray-900 text-white rounded-lg shadow-sm hover:bg-gray-800"
            title="Permission Control Panel"
          >
            <i className="ph ph-shield-check mr-2" /> Control Panel
          </button>
        )}
        <button
          onClick={onAdd}
          className="px-3 py-2 bg-red-500 text-white rounded-lg shadow-sm hover:bg-red-600"
        >
          <i className="ph ph-user-plus mr-2" /> Add Employee
        </button>
      </div>
    </div>
  );
}

export default memo(EmployeeToolbar);
