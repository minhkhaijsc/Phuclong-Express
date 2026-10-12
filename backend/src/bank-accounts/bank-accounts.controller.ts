import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankAccountsService } from './bank-accounts.service';
import type { CreateBankAccountDto, UpdateBankAccountDto } from './bank-accounts.service';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
@Controller('bank-accounts')
@MienQuyen('danhMuc')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  async findAll() {
    const data = await this.bankAccountsService.findAll();
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() createDto: CreateBankAccountDto,
    @Request() req: any,
  ) {
    return this.bankAccountsService.create(createDto, req.user?.username || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateBankAccountDto,
    @Request() req: any,
  ) {
    return this.bankAccountsService.update(Number(id), updateDto, req.user?.username || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.bankAccountsService.remove(Number(id), req.user?.username || 'system');
  }
}
