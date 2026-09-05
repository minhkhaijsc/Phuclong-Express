import { Module } from '@nestjs/common';
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
import { QnaModule } from './qna/qna.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ArticlesModule } from './articles/articles.module';
import { CommonModule } from './common/common.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
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
    QnaModule,
    NotificationsModule,
    ArticlesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
