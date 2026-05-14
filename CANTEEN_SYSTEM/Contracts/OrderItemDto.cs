namespace CANTEEN_SYSTEM.Contracts;

public record OrderItemDto(string ProductSyncId, string ProductName, int Quantity, decimal Price);
