import { Controller, Get, Post, Put, Delete, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { ShippersService } from './shippers.service';
import { QueryShipperDto, CreateShipperDto, UpdateShipperDto } from './dto/shipper.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Shippers Controller
 *
 * Handles shipper management operations
 */
@Controller('shippers')
@UseGuards(JwtAuthGuard)
@MienQuyen('vanChuyen')
export class ShippersController {
  constructor(private readonly shippersService: ShippersService) {}

  /**
   * Get all shippers
   * Matches: LoadDanhSachShipper() in Shipper_LietKe.cs
   */
  @Get()
  async getShippers() {
    return this.shippersService.getShippers();
  }

  /**
   * Get shipper by ID
   * Matches: LoadDataShipper() in Shipper_Them.cs
   */
  @Get(':id')
  async getShipperById(@Param('id') id: number) {
    return this.shippersService.getShipperById(id);
  }

  /**
   * Create new shipper
   * Matches: btCapNhat_Click() -> ThemShipper() in Shipper_Them.cs
   */
  @Post()
  async createShipper(@Body() createDto: CreateShipperDto, @Request() req: any) {
    return this.shippersService.createShipper(createDto, req.user?.username || 'system');
  }

  /**
   * Update shipper
   * Matches: btCapNhat_Click() -> CapNhatShipper() in Shipper_Them.cs
   */
  @Put(':id')
  async updateShipper(
    @Param('id') id: number,
    @Body() updateDto: UpdateShipperDto,
    @Request() req: any,
  ) {
    return this.shippersService.updateShipper(id, updateDto, req.user?.username || 'system');
  }

  /**
   * Delete shipper
   * Matches: gvShipper_RowDeleting() -> XoaShipper() in Shipper_LietKe.cs
   */
  @Delete(':id')
  async deleteShipper(@Param('id') id: number, @Request() req: any) {
    return this.shippersService.deleteShipper(id, req.user?.username || 'system');
  }
}
