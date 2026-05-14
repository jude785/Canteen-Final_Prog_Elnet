# UI/UX Files Documentation

## Overview
All user interface and experience files for the Canteen Management System are located in the `UI/` directory. This includes Razor views, static assets (CSS, JavaScript, images), and layout templates.

## Directory Structure

```
CANTEEN_SYSTEM/
├── UI/                          # All UI/UX files
│   ├── Views/                   # Razor view templates (.cshtml)
│   │   ├── Shared/              # Shared layouts and partial views
│   │   │   ├── _Layout.cshtml   # Main layout template
│   │   │   └── _ValidationScriptsPartial.cshtml
│   │   ├── Home/                # Home controller views
│   │   │   └── Index.cshtml
│   │   ├── Products/            # Product management views
│   │   ├── Orders/              # Order management views
│   │   ├── Users/               # User management views
│   │   └── _ViewImports.cshtml  # Global using statements for views
│   │   └── _ViewStart.cshtml    # Default layout configuration
│   └── wwwroot/                 # Static web assets
│       ├── css/                 # Stylesheets
│       │   └── site.css
│       ├── js/                  # JavaScript files
│       │   └── site.js
│       ├── lib/                 # Third-party libraries (Bootstrap, jQuery, etc.)
│       └── images/              # Image assets
├── Controllers/                 # MVC Controllers (logic layer)
├── Models/                      # Data models
├── Services/                    # Business logic services
└── Program.cs                   # Application entry point
```

## File Locations

### Views (Razor Templates)
- **Location:** `UI/Views/`
- **Purpose:** Server-rendered HTML templates
- **Subdirectories:**
  - `Shared/` - Layouts and partial views used across multiple pages
  - `[ControllerName]/` - Views specific to each controller (e.g., `Home/Index.cshtml`)

### Static Assets
- **Location:** `UI/wwwroot/`
- **Purpose:** Client-side resources served directly to browsers
- **Contents:**
  - `css/` - Custom stylesheets
  - `js/` - Custom JavaScript files
  - `lib/` - Third-party libraries (Bootstrap, jQuery, etc.)
  - `images/` - Image files

## Configuration Notes

The ASP.NET Core application is configured to serve static files from `UI/wwwroot/` and locate views in `UI/Views/`. This is handled in `Program.cs` with:

```csharp
app.UseStaticFiles(); // Serves files from UI/wwwroot/
// Views are automatically resolved from UI/Views/ by the MVC framework
```

## Why This Structure?

- **Separation of Concerns:** All UI-related files are isolated from business logic and data access code
- **Easy Navigation:** Developers can quickly find and modify UI elements
- **Standard MVC Pattern:** Maintains ASP.NET Core conventions while improving organization
- **Scalability:** Easy to add new views, controllers, and static assets as the application grows
