import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { OrdersModule } from './orders/orders.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { DebtReportsModule } from './debt-reports/debt-reports.module';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { WebsitesModule } from './websites/websites.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { DeliveryAddressesModule } from './delivery-addresses/delivery-addresses.module';
import { CustomerLimitsModule } from './customer-limits/customer-limits.module';
import { PeriodsModule } from './periods/periods.module';
import { BatchesModule } from './batches/batches.module';
import { ShipmentGroupsModule } from './shipment-groups/shipment-groups.module';
import { TrackingModule } from './tracking/tracking.module';
import { DatabaseModule } from './database/database.module';
import { ServiceFeesModule } from './service-fees/service-fees.module';
import { InStockItemsModule } from './in-stock-items/in-stock-items.module';
import { PurchasedItemsModule } from './purchased-items/purchased-items.module';
import { ShippersModule } from './shippers/shippers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { HopDongModule } from './hop-dong/hop-dong.module';
import { QnaModule } from './qna/qna.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ArticlesModule } from './articles/articles.module';
import { CommonModule } from './common/common.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { QuyenModule } from './auth/quyen/quyen.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { QuyenGuard } from './auth/guards/quyen.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    QuyenModule,
    AuthModule,
    CommonModule,
    UsersModule,
    RolesModule,
    OrdersModule,
    ShipmentsModule,
    DebtReportsModule,
    SystemLogsModule,
    WebsitesModule,
    BankAccountsModule,
    ExchangeRatesModule,
    DeliveryAddressesModule,
    CustomerLimitsModule,
    PeriodsModule,
    BatchesModule,
    ShipmentGroupsModule,
    TrackingModule,
    ServiceFeesModule,
    InStockItemsModule,
    PurchasedItemsModule,
    ShippersModule,
    SuppliersModule,
    QnaModule,
    NotificationsModule,
    ArticlesModule,
    DashboardModule,
    HopDongModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    /**
     * Hai guard này chạy cho MỌI route, theo đúng thứ tự: đăng nhập trước,
     * phân quyền sau.
     *
     * Trước đây guard được gắn lẻ trên từng controller, và bốn controller bị
     * bỏ sót hoàn toàn — batches (19 route), shipments (10), roles (3),
     * ty-gia (1). GET /api/roles trả 200 cho người không đăng nhập, còn
     * DELETE /api/roles/:id thì xoá được vai trò Admin, kéo theo mọi dòng
     * trong AspNetUserRoles. Gắn ở tầng ứng dụng thì không còn chỗ nào lọt.
     *
     * Route cố ý mở cho người chưa đăng nhập phải đánh dấu @Public().
     */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: QuyenGuard },
  ],
})
export class AppModule {}
