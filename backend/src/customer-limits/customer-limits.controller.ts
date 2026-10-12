import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CustomerLimitsService } from './customer-limits.service';
import type { QueryCustomerLimitDto, CreateCustomerLimitDto, UpdateCustomerLimitDto } from './customer-limits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
@Controller('customer-limits')
@MienQuyen('congNo')
export class CustomerLimitsController {
  constructor(private readonly customerLimitsService: CustomerLimitsService) {}

  @Get()
  async findAll(@Query() query: QueryCustomerLimitDto) {
    return this.customerLimitsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.customerLimitsService.findOne(Number(id));
    return { data };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateCustomerLimitDto,
    @Request() req: any,
  ) {
    return this.customerLimitsService.create(createDto, req.user?.username || 'system');
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCustomerLimitDto,
    @Request() req: any,
  ) {
    return this.customerLimitsService.update({ ...updateDto, id: Number(id) }, req.user?.username || 'system');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.customerLimitsService.remove(Number(id), req.user?.username || 'system');
  }
}
