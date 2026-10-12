import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { DeliveryAddressesService } from './delivery-addresses.service';
import type { QueryDeliveryAddressDto, CreateDeliveryAddressDto, UpdateDeliveryAddressDto } from './delivery-addresses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
@Controller('delivery-addresses')
@MienQuyen('diaChi')
export class DeliveryAddressesController {
  constructor(private readonly deliveryAddressesService: DeliveryAddressesService) {}

  @Get()
  async findAll(@Query() query: QueryDeliveryAddressDto) {
    return this.deliveryAddressesService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.deliveryAddressesService.findOne(Number(id));
    return { data };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateDeliveryAddressDto,
    @Request() req: any,
  ) {
    return this.deliveryAddressesService.create(createDto, req.user?.username || 'system');
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateDeliveryAddressDto,
    @Request() req: any,
  ) {
    return this.deliveryAddressesService.update({ ...updateDto, id: Number(id) }, req.user?.username || 'system');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.deliveryAddressesService.remove(Number(id), req.user?.username || 'system');
  }
}
