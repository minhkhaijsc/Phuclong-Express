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
  Request,
} from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { Shipment } from './entities/shipment.entity';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { QueryShipmentDto } from './dto/query-shipment.dto';
import { Order } from '../orders/entities/order.entity';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Shipments Controller
 *
 * Handles shipment CRUD endpoints.
 *
 * Endpoints:
 * - GET /shipments - List shipments with filters and pagination
 * - GET /shipments/:id - Get shipment by ID
 * - POST /shipments - Create new shipment
 * - PUT /shipments/:id - Update shipment
 * - DELETE /shipments/:id - Delete shipment
 * - GET /shipments/:id/orders - Get orders in this shipment
 * - POST /shipments/:id/complete - Mark shipment as completed
 */
@Controller('shipments')
@MienQuyen('vanChuyen')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  /**
   * GET /shipments
   * List shipments with filters and pagination
   *
   * Query params:
   * - tenDotHang: Filter by shipment name
   * - username: Filter by username
   * - maDatHang: Filter by order code
   * - includeCompleted: Include completed shipments (default: false)
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20)
   * - sortBy: Sort field (default: createdAt)
   * - sortOrder: Sort order (default: DESC)
   */
  @Get()
  async findAll(@Query() query: QueryShipmentDto): Promise<{
    data: Shipment[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.shipmentsService.findAll(query);
  }

  /**
   * GET /shipments/:id
   * Get shipment by ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Shipment> {
    return this.shipmentsService.findOne(id);
  }

  /**
   * POST /shipments
   * Create new shipment
   *
   * Body: CreateShipmentDto
   * - tenDotHang: Auto-generated as "DD-MM-YYYY_Username" if not provided
   * - phiShipVeVnVnd: Auto-calculated as phiShipVeVnUsd * tyGia
   * - tienHangVnd: Auto-calculated as tienHangUsd * tyGia
   */
  @Post()
  async create(@Body() createShipmentDto: CreateShipmentDto, @Request() req: any): Promise<Shipment> {
    return this.shipmentsService.create(createShipmentDto, req.user?.username || 'system');
  }

  /**
   * PUT /shipments/:id
   * Update shipment
   *
   * Body: UpdateShipmentDto
   */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateShipmentDto: UpdateShipmentDto,
    @Request() req: any,
  ): Promise<Shipment> {
    return this.shipmentsService.update(id, updateShipmentDto, req.user?.username || 'system');
  }

  /**
   * DELETE /shipments/:id
   * Delete shipment (hard delete)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<void> {
    return this.shipmentsService.remove(id, req.user?.username || 'system');
  }

  /**
   * GET /shipments/:id/orders
   * Get orders in this shipment
   *
   * Returns all orders linked to this shipment by tenDotHang
   */
  @Get(':id/orders')
  async getOrders(@Param('id', ParseIntPipe) id: number): Promise<Order[]> {
    return this.shipmentsService.getOrders(id);
  }

  /**
   * POST /shipments/:id/complete
   * Mark shipment as completed
   */
  @Post(':id/complete')
  async complete(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<Shipment> {
    return this.shipmentsService.complete(id, req.user?.username || 'system');
  }

  /**
   * GET /shipments/user/dot-hang-ship
   * Get shipping request list for user (YeuCauShipHang_LietKe.aspx)
   * Matches: SP_Lay_DotHangShip @username, @YeuCauGuiHang
   * Use yeuCauGuiHang=0 (chờ ship) or yeuCauGuiHang=1 (đang yêu cầu)
   */
  @Get('user/dot-hang-ship')
  async getDotHangShip(
    @Query('username') username: string,
    @Query('yeuCauGuiHang') yeuCauGuiHang: string,
  ): Promise<any[]> {
    return this.shipmentsService.getDotHangShip(username, Number(yeuCauGuiHang));
  }

  /**
   * POST /shipments/user/yeu-cau-ship
   * Submit shipping request for batch(es) (YeuCauShipHang_LietKe.aspx - btShip_Click)
   * Matches: SP_CapNhat_YeuCauShipHang @TenDotHang, @UserName, @YeuCauGui_GhiChu
   */
  @Post('user/yeu-cau-ship')
  async capNhatYeuCauShipHang(
    @Body() body: { tenDotHang: string; username: string; ghiChu?: string },
  ): Promise<{ success: boolean }> {
    return this.shipmentsService.capNhatYeuCauShipHang(body.tenDotHang, body.username, body.ghiChu || '');
  }

  /**
   * GET /shipments/user/thong-tin-ship/:id
   * Get shipping info by ID (ThongTinShipHang.aspx)
   * Matches: SP_Lay_ThongTinShipByID @ID
   */
  @Get('user/thong-tin-ship/:id')
  async getThongTinShipByID(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.shipmentsService.getThongTinShipByID(id);
  }
}
