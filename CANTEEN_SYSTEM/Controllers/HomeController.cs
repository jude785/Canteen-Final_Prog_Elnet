using System.Diagnostics;
using CANTEEN_SYSTEM.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication;
using System.Security.Claims;
using CANTEEN_SYSTEM.Data;
using CANTEEN_SYSTEM.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace CANTEEN_SYSTEM.Controllers
{
    public class HomeController : Controller
    {
        private readonly CanteenDbContext _db;

        public HomeController(CanteenDbContext db)
        {
            _db = db;
        }

        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Privacy()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }

        [HttpGet]
        public IActionResult Dashboard()
        {
            // Check if user is authenticated and is admin
            if (!User.Identity?.IsAuthenticated ?? true)
            {
                return RedirectToAction(nameof(Index));
            }

            var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value;
            if (!string.Equals(roleClaim, "admin", StringComparison.OrdinalIgnoreCase))
            {
                return RedirectToAction(nameof(Index));
            }

            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Admin";
            ViewData["UserName"] = userName;

            return View();
        }

        [HttpGet]
        public IActionResult Menu()
        {
            // Check if user is authenticated and is admin
            if (!User.Identity?.IsAuthenticated ?? true)
            {
                return RedirectToAction(nameof(Index));
            }

            var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value;
            if (!string.Equals(roleClaim, "admin", StringComparison.OrdinalIgnoreCase))
            {
                return RedirectToAction(nameof(Index));
            }

            return PhysicalFile(Path.Combine(Directory.GetCurrentDirectory(), "menu.html"), "text/html");
        }

        [HttpGet]
        public IActionResult Stock()
        {
            // Check if user is authenticated and is admin
            if (!User.Identity?.IsAuthenticated ?? true)
            {
                return RedirectToAction(nameof(Index));
            }

            var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value;
            if (!string.Equals(roleClaim, "admin", StringComparison.OrdinalIgnoreCase))
            {
                return RedirectToAction(nameof(Index));
            }

            return PhysicalFile(Path.Combine(Directory.GetCurrentDirectory(), "stock.html"), "text/html");
        }

        [HttpGet]
        public IActionResult Report()
        {
            // Check if user is authenticated and is admin
            if (!User.Identity?.IsAuthenticated ?? true)
            {
                return RedirectToAction(nameof(Index));
            }

            var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value;
            if (!string.Equals(roleClaim, "admin", StringComparison.OrdinalIgnoreCase))
            {
                return RedirectToAction(nameof(Index));
            }

            return PhysicalFile(Path.Combine(Directory.GetCurrentDirectory(), "reports.html"), "text/html");
        }

        [HttpPost]
        public async Task<IActionResult> Login([FromBody] CANTEEN_SYSTEM.Contracts.LoginRequest request)
        {
            var employee = await _db.Employees.FirstOrDefaultAsync(item =>
                item.QrCode == request.QrCode.Trim().ToUpper());

            if (employee is null || !BCrypt.Net.BCrypt.Verify(request.Pin.Trim(), employee.PinHash))
            {
                return Unauthorized(new { message = "Invalid QR code or PIN." });
            }

            // Create claims for the user
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, employee.Name),
                new Claim(ClaimTypes.Role, employee.Role),
                new Claim("EmployeeId", employee.Id.ToString()),
                new Claim("QrCode", employee.QrCode)
            };

            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var authProperties = new AuthenticationProperties();

            // Sign in the user
            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(claimsIdentity),
                authProperties);

            // Return employee info along with redirect URL based on role
            var redirectUrl = string.Equals(employee.Role, "admin", StringComparison.OrdinalIgnoreCase)
                ? "/Home/Dashboard"
                : "/";

            return Ok(new
            {
                id = employee.Id,
                name = employee.Name,
                role = employee.Role,
                qrCode = employee.QrCode,
                redirectUrl = redirectUrl
            });
        }

        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Ok(new { message = "Logged out successfully" });
        }

        [HttpGet]
        public IActionResult GetCurrentUser()
        {
            if (!User.Identity?.IsAuthenticated ?? true)
            {
                return Ok(new { isAuthenticated = false });
            }

            var employeeIdClaim = User.FindFirst("EmployeeId")?.Value;
            int.TryParse(employeeIdClaim, out var employeeId);

            return Ok(new
            {
                isAuthenticated = true,
                id = employeeId,
                name = User.FindFirst(ClaimTypes.Name)?.Value,
                role = User.FindFirst(ClaimTypes.Role)?.Value,
                qrCode = User.FindFirst("QrCode")?.Value
            });
        }
    }
}
