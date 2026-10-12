import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ShipmentGroupsService } from './shipment-groups.service';
import { CreateShipmentGroupDto } from './dto/create-shipment-group.dto';
import { UpdateShipmentGroupDto } from './dto/update-shipment-group.dto';
import { QueryShipmentGroupDto } from './dto/query-shipment-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Shipment Groups Controller
 *
 * Handles shipment group (DotHang) CRUD endpoints.
 *
 * Endpoints:
 * - GET /shipment-groups - List shipment groups with filters
 * - GET /shipment-groups/:id - Get shipment group by ID
 * - POST /shipment-groups - Create new shipment group
 * - PUT /shipment-groups/:id - Update shipment group
 * - DELETE /shipment-groups/:id - Soft delete shipment group
 * - GET /shipment-groups/:username/:tenDotHang - Get shipment group by username and name
 * - PUT /shipment-groups/:username/:tenDotHang/ship - Update shipping info
 * - PUT /shipment-groups/:username/:tenDotHang/complete - Mark as complete
 */
@Controller('shipment-groups')
@MienQuyen('vanChuyen')
export class ShipmentGroupsController {
  constructor(private readonly shipmentGroupsService: ShipmentGroupsService) {}

  /**
   * GET /shipment-groups
   * List shipment groups with filters
   */
  @Get()
  async findAll(
    @Query() query: QueryShipmentGroupDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    return this.shipmentGroupsService.findAll(query);
  }

  /**
   * GET /shipment-groups/delivered
   * List delivered shipment groups
   */
  @Get('delivered')
  async findDelivered(
    @Query() query: QueryShipmentGroupDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    return this.shipmentGroupsService.findDelivered(query);
  }

  /**
   * GET /shipment-groups/:id
   * Get shipment group by ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.shipmentGroupsService.findOne(id);
  }

  /**
   * GET /shipment-groups/user/:username
   * Get shipment groups by username
   */
  @Get('user/:username')
  async findByUsername(@Param('username') username: string): Promise<any[]> {
    return this.shipmentGroupsService.findByUsername(username);
  }

  /**
   * GET /shipment-groups/:username/:tenDotHang
   * Get shipment group by username and tenDotHang
   */
  @Get(':username/:tenDotHang')
  async findByUsernameAndTenDotHang(
    @Param('username') username: string,
    @Param('tenDotHang') tenDotHang: string,
  ): Promise<any> {
    return this.shipmentGroupsService.findByUsernameAndTenDotHang(username, tenDotHang);
  }

  /**
   * POST /shipment-groups
   * Create new shipment group
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createShipmentGroupDto: CreateShipmentGroupDto,
    @Request() req: any,
  ): Promise<any> {
    return this.shipmentGroupsService.create(createShipmentGroupDto, req.user?.username || 'system');
  }

  /**
   * PUT /shipment-groups/:id
   * Update shipment group
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateShipmentGroupDto: UpdateShipmentGroupDto,
    @Request() req: any,
  ): Promise<any> {
    return this.shipmentGroupsService.update(id, updateShipmentGroupDto, req.user?.username || 'system');
  }

  /**
   * DELETE /shipment-groups/:id
   * Soft delete shipment group
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<void> {
    return this.shipmentGroupsService.remove(id, req.user?.username || 'system');
  }

  /**
   * PUT /shipment-groups/:username/:tenDotHang/ship
   * Update shipping info for shipment group
   */
  @Put(':username/:tenDotHang/ship')
  @UseGuards(JwtAuthGuard)
  async updateShipping(
    @Param('username') username: string,
    @Param('tenDotHang') tenDotHang: string,
    @Body() body: {
      shipperId: number;
      ngayGuiHang: string;
      soVanDon: string;
      phiShipTrongNuoc: number;
    },
    @Request() req: any,
  ): Promise<any> {
    return this.shipmentGroupsService.updateShipping(
      username,
      tenDotHang,
      body.shipperId,
      body.ngayGuiHang,
      body.soVanDon,
      body.phiShipTrongNuoc,
      req.user?.username || 'system',
    );
  }

  /**
   * PUT /shipment-groups/:username/:tenDotHang/ship1
   * Update shipping info from DotHang_Ship1 flow.
   */
  @Put(':username/:tenDotHang/ship1')
  @UseGuards(JwtAuthGuard)
  async updateShippingFromDebtReport(
    @Param('username') username: string,
    @Param('tenDotHang') tenDotHang: string,
    @Body() body: {
      shipperId: number;
      ngayGuiHang: string;
      soVanDon: string;
      phiShipTrongNuoc: number;
      diaChiNhanHang: string;
      datCoc: number;
    },
    @Request() req: any,
  ): Promise<any> {
    return this.shipmentGroupsService.updateShippingFromDebtReport(
      username,
      tenDotHang,
      body.shipperId,
      body.ngayGuiHang,
      body.soVanDon,
      body.phiShipTrongNuoc,
      body.diaChiNhanHang,
      body.datCoc,
      req.user?.username || 'system',
    );
  }

  /**
   * PUT /shipment-groups/:username/:tenDotHang/complete
   * Mark shipment group as complete
   */
  @Put(':username/:tenDotHang/complete')
  @UseGuards(JwtAuthGuard)
  async complete(
    @Param('username') username: string,
    @Param('tenDotHang') tenDotHang: string,
    @Request() req: any,
  ): Promise<any> {
    return this.shipmentGroupsService.complete(username, tenDotHang, req.user?.username || 'system');
  }
}
