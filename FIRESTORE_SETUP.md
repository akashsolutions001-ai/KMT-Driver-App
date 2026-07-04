# Firestore Database Structure

This document describes the Firestore collection structure required for the Bus Tracking Driver App.

## Collections

### 1. `drivers` Collection

**Document ID**: Auto-generated or any ID (e.g., "1", "2", etc.)

**Fields**:
```typescript
{
  driverId: string;       // Driver ID field (e.g., "DRV-001") - used for login
  name: string;           // Driver's full name
  password: string;        // Driver password (set by admin, used for login)
  routeId?: string;        // Reference to route document ID (or assignedRouteId)
  assignedBusId?: string;  // Optional: Assigned bus ID
  email?: string;         // Optional email (used for Firebase Auth, defaults to driverId@driverapp.com)
  phone?: string;         // Optional phone number
  status?: string;        // Optional: Driver status (e.g., "active")
}
```

**Example**:
```json
{
  "driverId": "DRV-001",
  "name": "Rajesh Kumar",
  "password": "rajesh123",
  "routeId": "RT-42",
  "assignedBusId": "1",
  "phone": "+91 98765 43210",
  "status": "active"
}
```

**Important Notes**:
- **Document ID vs driverId Field**: The document ID can be any value (e.g., "1", "2"). The `driverId` field within the document is what drivers use to log in.
- **Login Credentials**: 
  - **Driver ID**: Use the `driverId` field value (e.g., "DRV-001")
  - **Password**: Use the `password` field value (e.g., "rajesh123")
- **Password**: Admin sets the password in Firestore. This password is used for authentication.
- **Email**: If provided, it's used for Firebase Authentication. If not provided, the system uses `{driverId}@driverapp.com`.
- **Authentication Flow**: 
  1. Driver enters `driverId` field value and `password` field value
  2. System queries Firestore by `driverId` field (not document ID)
  3. System verifies password matches
  4. If password matches, system authenticates with Firebase Auth
  5. If Firebase Auth user doesn't exist, it's created automatically

### 2. `routes` Collection

**Document ID**: Route ID (e.g., "RT-42")

**Fields**:
```typescript
{
  name: string;           // Route name (e.g., "Downtown Express")
  busNumber: string;      // Bus number (e.g., "BUS-1542")
  stopIds: string[];      // Array of stop document IDs
  description?: string;    // Optional route description
  startTime?: string;      // Optional start time
  endTime?: string;        // Optional end time
}
```

**Example**:
```json
{
  "name": "Downtown Express",
  "busNumber": "BUS-1542",
  "stopIds": ["STOP-001", "STOP-002", "STOP-003", "STOP-004"],
  "description": "Main downtown route",
  "startTime": "07:00",
  "endTime": "18:00"
}
```

### 3. `stops` Collection

**Document ID**: Stop ID (e.g., "STOP-001")

**Fields**:
```typescript
{
  name: string;           // Stop name (e.g., "Central Station")
  order: number;          // Order/sequence in the route (1, 2, 3, ...)
  routeId?: string;        // Optional: Reference to route (for querying)
  latitude?: number;       // Optional: GPS latitude
  longitude?: number;      // Optional: GPS longitude
  address?: string;       // Optional: Physical address
}
```

**Example**:
```json
{
  "name": "Central Station",
  "order": 1,
  "routeId": "RT-42",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "address": "123 Main St, City"
}
```

### 4. `buses` Collection

**Document ID**: Auto-generated or Bus ID

**Fields**:
```typescript
{
  busNumber: string;       // Bus number (e.g., "BUS-1542")
  capacity?: number;       // Optional: Passenger capacity
  model?: string;         // Optional: Bus model
  year?: number;          // Optional: Manufacturing year
  status?: string;        // Optional: Status (active, maintenance, etc.)
}
```

**Example**:
```json
{
  "busNumber": "BUS-1542",
  "capacity": 50,
  "model": "Volvo B7R",
  "year": 2020,
  "status": "active"
}
```

## Firestore Security Rules

Add these security rules to your Firestore database:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Drivers collection - read only for authenticated users
    match /drivers/{driverId} {
      allow read: if request.auth != null || true; // Adjust based on your auth needs
      allow write: if false; // Only allow writes from admin/backend
    }
    
    // Routes collection - read only
    match /routes/{routeId} {
      allow read: if true;
      allow write: if false; // Only allow writes from admin/backend
    }
    
    // Stops collection - read only
    match /stops/{stopId} {
      allow read: if true;
      allow write: if false; // Only allow writes from admin/backend
    }
    
    // Buses collection - read only
    match /buses/{busId} {
      allow read: if true;
      allow write: if false; // Only allow writes from admin/backend
    }
  }
}
```

## Setup Instructions

1. **Create Collections**: Create the four collections (`drivers`, `routes`, `stops`, `buses`) in your Firestore database.

2. **Add Sample Data**:
   - Create stops first (they are referenced by routes)
   - Create routes (reference stops via `stopIds`)
   - Create buses
   - Create drivers (reference routes via `routeId`)

3. **Test Login**: Use a driver ID and password that exists in your `drivers` collection.

## Authentication

The app uses a hybrid authentication approach:

1. **Firestore Verification**: Driver ID and password are verified against Firestore (set by admin)
2. **Firebase Auth**: After Firestore verification, the app authenticates with Firebase Auth
3. **Auto-Creation**: If a Firebase Auth user doesn't exist, it's created automatically using the email (or `driverId@driverapp.com`)

### Admin Setup Process

1. **Create Driver in Firestore**:
   - Document ID can be any value (e.g., "1", "2", "driver-001")
   - Add fields including:
   ```json
   {
     "driverId": "DRV-001",
     "name": "Rajesh Kumar",
     "password": "rajesh123",
     "routeId": "RT-42",
     "assignedBusId": "1",
     "phone": "+91 98765 43210",
     "status": "active",
     "email": "rajesh@example.com"  // Optional
   }
   ```

2. **Driver Login**: 
   - **Driver ID**: Use the `driverId` field value (e.g., "DRV-001")
   - **Password**: Use the `password` field value (e.g., "rajesh123")

3. **Automatic Firebase Auth**: The system automatically creates/authenticates with Firebase Auth

### Security Notes

- **Password Storage**: Passwords are stored in Firestore (set by admin). For enhanced security:
  - Consider using Firebase Authentication directly (admin creates users in Firebase Console)
  - Or implement password hashing before storing in Firestore
  - Use Firebase Security Rules to restrict access to password field

- **Data Relationships**:
  - Driver → Route (via `routeId`)
  - Route → Stops (via `stopIds` array)
  - Route → Bus (via `busNumber`)

- **Querying**: The app fetches data in a cascading manner:
  1. Fetch driver by ID
  2. Fetch route by routeId from driver
  3. Fetch stops by stopIds from route
  4. Optionally fetch bus by busNumber from route
