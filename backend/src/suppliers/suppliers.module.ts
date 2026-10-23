import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { SupplierDebtController } from './supplier-debt.controller';
import { SupplierDebtService } from './supplier-debt.service';
import { SupplierPaymentService } from './supplier-payment.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [DatabaseModule, AuthModule, SystemLogsModule],
  controllers: [SuppliersController, SupplierDebtController],
  providers: [SuppliersService, SupplierDebtService, SupplierPaymentService],
  exports: [SuppliersService, SupplierDebtService],
})
export class SuppliersModule {}
