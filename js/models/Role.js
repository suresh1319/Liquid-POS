// Role model for user permissions
export class Role {
    constructor(data = {}) {
        this.id = data.id || '';
        this.name = data.name || '';
        this.email = data.email || '';
        this.permissions = data.permissions || [];
    }

    // Create a Role from JSON data
    static fromJson(json) {
        return new Role({
            id: json.id,
            name: json.name,
            email: json.email,
            permissions: json.permissions || []
        });
    }

    // Convert Role to JSON
    toJson() {
        return {
            id: this.id,
            name: this.name,
            email: this.email,
            permissions: this.permissions
        };
    }

    // Check if this role has a specific permission
    hasPermission(module, action) {
        return this.permissions.some(p =>
            p.module === module && p.actions.includes(action)
        );
    }
}

// Permission model
export class Permission {
    constructor(data = {}) {
        this.module = data.module || '';
        this.actions = data.actions || [];
    }

    // Create a Permission from JSON data
    static fromJson(json) {
        return new Permission({
            module: json.module,
            actions: json.actions || []
        });
    }

    // Convert Permission to JSON
    toJson() {
        return {
            module: this.module,
            actions: this.actions
        };
    }
}
