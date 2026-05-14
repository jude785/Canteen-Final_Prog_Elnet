using CANTEEN_SYSTEM.Contracts;
using CANTEEN_SYSTEM.Data.Entities;

namespace CANTEEN_SYSTEM.Extensions;

public static class MappingExtensions
{
    private static readonly Dictionary<string, int> CategoryMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["All"] = 1,
        ["Meals"] = 2,
        ["Drinks"] = 3,
        ["Snacks"] = 4
    };

    public static ProductDto ToDto(this Product product)
    {
        var categoryId = CategoryMap.GetValueOrDefault(product.Category, 1);
        return new ProductDto(product.Id, product.Name, product.Price, product.Stock, categoryId, product.Category, product.ImageUrl);
    }

    public static EmployeeDto ToDto(this Employee employee) =>
        new(employee.Id, employee.Name, employee.QrCode, employee.Role, employee.CreatedAt);

    public static OrderDto ToDto(this Order order) =>
        new(
            order.Id,
            order.OrderNumber,
            order.TotalAmount,
            order.PaymentMethod,
            order.Status,
            order.CreatedAt,
            order.ReferenceNumber,
            order.AmountReceived,
            order.Change,
            order.Items
                .OrderBy(item => item.Id)
                .Select(item => new OrderItemDto(item.ProductSyncId ?? string.Empty, item.ProductName, item.Quantity, item.UnitPrice))
                .ToList());
}
