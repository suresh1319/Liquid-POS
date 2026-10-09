import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "../sdk.js";
import { CurrencyData } from "../utils/CurrencyData.js";
import EmployeeToolbar from "../components/employees/EmployeeToolbar.js";
import EmployeeRow from "../components/employees/EmployeeRow.js";
import EmployeeModal from "../components/employees/EmployeeModal.js";
import EmployeeDetailsModal from "../components/employees/EmployeeDetailsModal.js";
import EmployeeStats from "../components/employees/EmployeeStats.js";
import EmployeeCharts from "../components/employees/EmployeeCharts.js";
import PermissionControlPanel from "../components/employees/PermissionControlPanel.js";
// Import ProfileContext to access profile data
import { useProfile } from "../contexts/ProfileContext.js";

// Generate a unique ID for employees
const generateUniqueEmployeeId = () => {
  // Generate a UUID-like unique identifier
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  return `emp_${timestamp}_${randomPart}${randomPart2}`;
};

// Check if an employee has a proper unique ID format
const hasValidUniqueId = (id) => {
  return id && id.startsWith('emp_') && id.includes('_') && id.length > 20;
};

// Helper function to find employee by unique ID (handles both old and new formats)
const findEmployeeById = async (employeeId) => {
  try {
    // First try to find by document ID
    const docRef = await sdk.db.collection('Employees').doc(employeeId).get();
    if (docRef.exists) {
      return { id: employeeId, ...docRef.data() };
    }
    
    // If not found by document ID, try to find by uniqueId field
    const querySnapshot = await sdk.db.collection('Employees').where('uniqueId', '==', employeeId).get();
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    
    // If still not found, try to find by migratedFrom field (for old IDs)
    const migratedQuery = await sdk.db.collection('Employees').where('migratedFrom', '==', employeeId).get();
    if (!migratedQuery.empty) {
      const doc = migratedQuery.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    
    return null;
  } catch (error) {
    console.error('Error finding employee by ID:', error);
    return null;
  }
};

export default function Employees() {
  // Use profile context to get the current currency
  const { profile } = useProfile();
  
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [employeesUnsubscribe, setEmployeesUnsubscribe] = useState(null);
  const [roleFilter, setRoleFilter] = useState('All');
  const [permOpen, setPermOpen] = useState(false);
  // Use profile currency as default, fallback to INR
  const [displayCurrency, setDisplayCurrency] = useState(profile?.currencyCode || 'INR');

  // Update displayCurrency when profile currency changes
  useEffect(() => {
    if (profile?.currencyCode) {
      setDisplayCurrency(profile.currencyCode);
    }
  }, [profile?.currencyCode]);

  const [modalState, setModalState] = useState({
    open: false,
    mode: "add",
    data: {},
  });

  const [detailsModalState, setDetailsModalState] = useState({
    open: false,
    employee: null,
  });

  // Subscribe to employees in real-time
  useEffect(() => {
    fetchEmployees();
    // Run unique ID assignment for existing employees once on component mount
    assignUniqueIdsToExistingEmployees();
    return () => {
      if (employeesUnsubscribe) employeesUnsubscribe();
    };
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const collection = sdk.db.collection("Employees");

      if (employeesUnsubscribe) employeesUnsubscribe();

      const unsubscribe = collection.onSnapshot(
        (snapshot) => {
          const list = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setEmployees(list);
          setLoading(false);
        },
        (err) => {
          console.error("Employees snapshot error", err);
          setError("Failed to load employees");
          setLoading(false);
        }
      );

      setEmployeesUnsubscribe(() => unsubscribe);
    } catch (e) {
      console.error("Employees load error", e);
      setError("Failed to load employees");
      setLoading(false);
    }
  };

  // Filter employees by search query
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = employees.filter(
      (emp) =>
        (emp?.name || "").toLowerCase().includes(q) ||
        (emp?.email || "").toLowerCase().includes(q) ||
        (emp?.phone || "").toLowerCase().includes(q)
    );
    if (roleFilter === 'All') return base;
    const targetRole = String(roleFilter || '').toLowerCase();
    return base.filter(emp => String(emp.role || 'Staff').toLowerCase() === targetRole);
  }, [employees, searchQuery, roleFilter]);

  // Function to assign unique IDs to existing employees that don't have them
  const assignUniqueIdsToExistingEmployees = async () => {
    try {
      const employeesSnap = await sdk.db.collection("Employees").get();
      const updates = [];
      
      employeesSnap.docs.forEach(doc => {
        const employeeId = doc.id;
        const employeeData = doc.data();
        
        // Check if employee has a valid unique ID format
        if (!hasValidUniqueId(employeeId)) {
          const newUniqueId = generateUniqueEmployeeId();
          
          // Add uniqueId field to employee data and create new document with proper ID
          updates.push({
            oldId: employeeId,
            newId: newUniqueId,
            data: {
              ...employeeData,
              uniqueId: newUniqueId,
              migratedFrom: employeeId // Keep track of old ID for reference
            }
          });
        } else if (!employeeData.uniqueId) {
          // If ID is already good format but missing uniqueId field, add it
          updates.push({
            oldId: employeeId,
            newId: employeeId,
            data: {
              ...employeeData,
              uniqueId: employeeId
            }
          });
        }
      });
      
      // Execute updates
      for (const update of updates) {
        if (update.oldId !== update.newId) {
          // Create new document with proper unique ID
          await sdk.db.collection("Employees").doc(update.newId).set(update.data);
          // Delete old document
          await sdk.db.collection("Employees").doc(update.oldId).delete();
          console.log(`Migrated employee from ${update.oldId} to ${update.newId}`);
        } else {
          // Just update existing document to add uniqueId field
          await sdk.db.collection("Employees").doc(update.oldId).update({ uniqueId: update.newId });
          console.log(`Added uniqueId field to employee ${update.oldId}`);
        }
      }
      
      if (updates.length > 0) {
        console.log(`Updated ${updates.length} employees with unique IDs`);
      }
    } catch (error) {
      console.error('Error assigning unique IDs to existing employees:', error);
    }
  };

  const addEmployee = async (data) => {
    // Generate a truly unique ID
    const uniqueId = generateUniqueEmployeeId();
    
    // Get role permissions if role is provided
    let rolePermissions = [];
    if (data.role) {
      // Special handling for Owner role - give all permissions
      if (data.role === 'Owner') {
        // Grant all permissions to Owner
        const FEATURES = ['home','products','KDS','ai-menu','customers','employees','passbook','reports','expenses','analytics','settings'];
        rolePermissions = FEATURES.map(feature => ({
          module: feature,
          actions: ['view']
        }));
        console.log(`Assigned ALL permissions to Owner employee`);
      } else {
        try {
          // Find role by name in Roles collection
          const rolesSnap = await sdk.db.collection('Roles').where('name', '==', data.role).get();
          if (!rolesSnap.empty) {
            const roleDoc = rolesSnap.docs[0];
            const roleData = roleDoc.data();
            rolePermissions = roleData.permissions || [];
            console.log(`Assigned ${rolePermissions.length} permissions to ${data.role} employee`);
          } else {
            console.log(`No role definition found for ${data.role}, using default permissions`);
          }
        } catch (error) {
          console.error('Error fetching role permissions:', error);
        }
      }
    }
    
    await sdk.db.collection("Employees").doc(uniqueId).set({
      uniqueId: uniqueId, // Store the unique ID as a field as well
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "Staff",
      status: "OFFLINE", // Default status is OFFLINE until they log in
      isLoggedIn: false, // Track login state
      lastActivity: new Date(), // Track last activity time
      joinedAt: new Date(),
      hourlyRate: data.role === 'Owner' ? 0 : (data.hourlyRate ? Number(data.hourlyRate) : 0),
      hourlyCurrency: data.role === 'Owner' ? 'INR' : (data.hourlyCurrency || 'INR'),
      shifts: data.shifts || 0,
      permissions: rolePermissions, // Assign role permissions
    });
  };

  const updateEmployee = async (employeeId, partial) => {
    try {
      // Find the actual employee document
      const employee = await findEmployeeById(employeeId);
      if (!employee) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }
      
      const actualDocId = employee.id;
      
      // If role is being changed, fetch and assign role permissions
      if (partial.role) {
        // Special handling for Owner role - give all permissions
        if (partial.role === 'Owner') {
          // Grant all permissions to Owner
          const FEATURES = ['home','products','KDS','ai-menu','customers','employees','passbook','reports','expenses','analytics','settings'];
          const rolePermissions = FEATURES.map(feature => ({
            module: feature,
            actions: ['view']
          }));
          partial.permissions = rolePermissions;
          console.log(`Assigned ALL permissions to Owner employee`);
        } else {
          try {
            const rolesSnap = await sdk.db.collection('Roles').where('name', '==', partial.role).get();
            if (!rolesSnap.empty) {
              const roleDoc = rolesSnap.docs[0];
              const roleData = roleDoc.data();
              
              // Apply role permissions
              const rolePermissions = roleData.permissions || [];
              partial.permissions = rolePermissions;
              console.log(`Updated ${partial.role} employee with ${rolePermissions.length} permissions`);
            } else {
              console.log(`No role definition found for ${partial.role}, using empty permissions`);
              partial.permissions = [];
            }
          } catch (error) {
            console.error('Error fetching role permissions during update:', error);
          }
        }
      }
      
      // Set hourly rate to 0 for owners
      if (partial.role === 'Owner') {
        partial.hourlyRate = 0;
        partial.hourlyCurrency = 'INR';
      }
      
      await sdk.db.collection("Employees").doc(actualDocId).update(partial);
      console.log(`Updated employee ${actualDocId} successfully`);
    } catch (error) {
      console.error('Error updating employee:', error);
      throw error;
    }
  };

  const deleteEmployee = async (employeeId) => {
    try {
      // Find the actual employee document
      const employee = await findEmployeeById(employeeId);
      if (!employee) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }
      
      const actualDocId = employee.id;
      
      // Invalidate access token before deletion
      await sdk.db.collection("Employees").doc(actualDocId).update({
        accessTokenToken: null,
        accessLink: null,
        deviceBindingId: null,
        currentDeviceId: null
      });
      
      // Small delay to ensure token invalidation is processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await sdk.db.collection("Employees").doc(actualDocId).delete();
      console.log(`Deleted employee ${actualDocId} successfully`);
    } catch (error) {
      console.error('Error deleting employee:', error);
      throw error;
    }
  };

  // Log employee activity for tracking
  const logEmployeeActivity = async (employeeId, loginTime, logoutTime = null) => {
    try {
      const employee = await findEmployeeById(employeeId);
      if (!employee) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }
      
      const actualDocId = employee.id;
      const today = new Date();
      const dateKey = today.toISOString().split('T')[0]; // Use ISO date format YYYY-MM-DD
      
      // Create or update activity log for today
      const activityLogRef = sdk.db.collection('EmployeeActivityLogs').doc(`${actualDocId}_${dateKey}`);
      
      const logData = {
        employeeId: actualDocId,
        employeeName: employee.name,
        date: today,
        dateKey: dateKey,
        loginTime: loginTime || new Date(),
        logoutTime: logoutTime,
        updatedAt: new Date()
      };
      
      // Use merge to update existing document or create new one
      await activityLogRef.set(logData, { merge: true });
      console.log(`Activity logged for employee ${actualDocId}`);
    } catch (error) {
      console.error('Error logging employee activity:', error);
    }
  };

  // Attendance management functions
  const markEmployeeOnline = async (employeeId) => {
    try {
      const employee = await findEmployeeById(employeeId);
      if (!employee) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }
      
      const actualDocId = employee.id;
      const loginTime = new Date();
      
      await sdk.db.collection("Employees").doc(actualDocId).update({
        status: "ONLINE",
        isLoggedIn: true,
        lastActivity: loginTime,
        loginTime: loginTime
      });
      
      // Log the activity
      await logEmployeeActivity(employeeId, loginTime);
      
      console.log(`Employee ${actualDocId} marked as online`);
    } catch (error) {
      console.error('Error marking employee online:', error);
      throw error;
    }
  };

  const markEmployeeOffline = async (employeeId) => {
    try {
      const employee = await findEmployeeById(employeeId);
      if (!employee) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }
      
      const actualDocId = employee.id;
      const logoutTime = new Date();
      
      await sdk.db.collection("Employees").doc(actualDocId).update({
        status: "OFFLINE",
        isLoggedIn: false,
        lastActivity: logoutTime,
        logoutTime: logoutTime
      });
      
      // Update the activity log with logout time
      await logEmployeeActivity(employeeId, null, logoutTime);
      
      console.log(`Employee ${actualDocId} marked as offline`);
    } catch (error) {
      console.error('Error marking employee offline:', error);
      throw error;
    }
  };

  const updateEmployeeActivity = async (employeeId) => {
    try {
      const employee = await findEmployeeById(employeeId);
      if (!employee) return;
      
      const actualDocId = employee.id;
      await sdk.db.collection("Employees").doc(actualDocId).update({
        lastActivity: new Date()
      });
    } catch (error) {
      console.error('Error updating employee activity:', error);
    }
  };

  const confirmDelete = useCallback((emp) => {
    const employeeName = emp.name || emp.email || emp.phone || "this employee";
    const ok = confirm(`Delete ${employeeName}?\n\nEmployee ID: ${emp.uniqueId || emp.id}`);
    if (!ok) return;
    
    // Use the uniqueId if available, otherwise fall back to document id
    const employeeId = emp.uniqueId || emp.id;
    
    deleteEmployee(employeeId).catch((e) => {
      console.error("Delete failed", e);
      alert(`Failed to delete employee: ${e.message}`);
    });
  }, []);

  // Empty state
  const EmptyState = () => (
    <div className="text-center py-16 px-4 bg-white rounded-xl shadow-sm mt-4 border border-gray-100">
      <div className="mb-4">
        <i className="ph ph-user text-6xl text-gray-200" />
      </div>
      <h3 className="text-xl font-medium text-gray-500 mb-2">
        No employees yet
      </h3>
      <p className="text-gray-400">Add your first employee to get started</p>
    </div>
  );

  // Modal handlers
  const openAddModal = useCallback(
    () => setModalState({ open: true, mode: "add", data: {} }),
    []
  );
  const openEditModal = useCallback(
    (emp) => setModalState({ open: true, mode: "edit", data: emp }),
    []
  );
  const closeModal = useCallback(
    () => setModalState({ open: false, mode: "add", data: {} }),
    []
  );

  // Details modal handlers
  const openDetailsModal = useCallback(
    (emp) => setDetailsModalState({ open: true, employee: emp }),
    []
  );
  const closeDetailsModal = useCallback(
    () => setDetailsModalState({ open: false, employee: null }),
    []
  );
  
  // Update employee data in the local state
  const updateEmployeeData = useCallback((employeeId, updateData) => {
    setEmployees(prevEmployees => 
      prevEmployees.map(emp => {
        if ((emp.uniqueId || emp.id) === employeeId) {
          return { ...emp, ...updateData };
        }
        return emp;
      })
    );
    
    // Also update the employee in the details modal state if it's the same employee
    setDetailsModalState(prevState => {
      if (prevState.employee && (prevState.employee.uniqueId || prevState.employee.id) === employeeId) {
        return {
          ...prevState,
          employee: { ...prevState.employee, ...updateData }
        };
      }
      return prevState;
    });
  }, []);

  const onSubmitModal = async (formState) => {
    try {
      if (modalState.mode === "add") {
        await addEmployee(formState);
      } else {
        // Use the uniqueId if available, otherwise fall back to document id
        const employeeId = modalState.data.uniqueId || modalState.data.id;
        await updateEmployee(employeeId, formState);
      }
      closeModal();
    } catch (err) {
      console.error("Employee save failed", err);
      alert(`Failed to save employee: ${err.message}`);
    }
  };

  // Stats
  const total = employees.length;
  const online = employees.filter(
    (e) => e.isLoggedIn === true && e.status === "ONLINE"
  ).length;
  
  // Filter out owners from average hourly rate calculation and only include online employees
  const activeNonOwnerEmployees = employees.filter(e => e.role !== 'Owner' && e.isLoggedIn === true);
  const avgRate = activeNonOwnerEmployees.length
    ? Math.round(
        (activeNonOwnerEmployees.reduce(
          (s, e) => s + (Number(e.hourlyRate) || 0),
          0
        ) / activeNonOwnerEmployees.length) * 100
      ) / 100
    : 0;

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="p-4">
        {/* ✅ using only EmployeeToolbar, no duplicate inline toolbar */}
         <EmployeeToolbar
          initialQuery={searchQuery}
          onQueryChange={setSearchQuery}
          onAdd={openAddModal}
           roleFilter={roleFilter}
           onRoleChange={setRoleFilter}
           onOpenPanel={() => setPermOpen(true)}
        />

        {/* Stats */}
        <EmployeeStats 
          total={total} 
          active={online} 
          avgRate={avgRate} 
          employees={employees} 
          displayCurrency={displayCurrency}
          onCurrencyChange={setDisplayCurrency}
        />

        {/* List */}
        {employees.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {filteredEmployees.map((emp) => (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                displayCurrency={displayCurrency}
                onCurrencyChange={setDisplayCurrency}
                onDetails={openDetailsModal}
                onDelete={confirmDelete}
              />
            ))}
          </div>
        )}

        {/* Charts */}
        <EmployeeCharts employees={employees} />
      </div>

      {/* Modal */}
      <EmployeeModal
        open={modalState.open}
        mode={modalState.mode}
        data={modalState.data}
        onClose={closeModal}
        onSubmit={onSubmitModal}
        displayCurrency={displayCurrency}
      />
      
      {/* Details Modal */}
      <EmployeeDetailsModal
        emp={detailsModalState.employee}
        isOpen={detailsModalState.open}
        onClose={closeDetailsModal}
        displayCurrency={displayCurrency}
        onUpdate={updateEmployeeData}
      />
      
       <PermissionControlPanel isOpen={permOpen} onClose={() => setPermOpen(false)} />
    </div>
  );
}
