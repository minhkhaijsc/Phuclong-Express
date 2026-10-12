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
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { QueryBatchDto } from './dto/query-batch.dto';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Batches Controller
 *
 * Handles batch (LoHang) CRUD endpoints.
 *
 * Endpoints:
 * - GET /batches - List batches with filters and pagination
 * - GET /batches/:id - Get batch by ID
 * - POST /batches - Create new batch
 * - PUT /batches/:id - Update batch
 * - DELETE /batches/:id - Soft delete batch
 * - GET /batches/:id/details - Get batch details (ship costs, customs, tracking)
 * - GET /batches/:id/costs - Get batch costs
 * - POST /batches/:id/costs - Add batch cost
 * - PUT /batches/:id/costs/:costId - Update batch cost
 * - DELETE /batches/:id/costs/:costId - Delete batch cost
 */
@Controller('batches')
@MienQuyen('vanChuyen')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  /**
   * GET /batches
   * List batches with filters and pagination
   */
  @Get()
  async findAll(
    @Query() query: QueryBatchDto,
  ): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
    return this.batchesService.findAll(query);
  }

  /**
   * GET /batches/ten/:tenLoHang
   * Get batch details by TenLoHang (for public lot info page)
   * MUST be defined before :id to avoid route collision
   */
  @Get('ten/:tenLoHang')
  async findByTenLoHang(@Param('tenLoHang') tenLoHang: string): Promise<any> {
    return this.batchesService.findByTenLoHang(tenLoHang);
  }

  /**
   * GET /batches/:id
   * Get batch by ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.batchesService.findOne(id);
  }

  /**
   * POST /batches
   * Create new batch
   */
  @Post()
  async create(@Body() createBatchDto: CreateBatchDto): Promise<any> {
    return this.batchesService.create(createBatchDto);
  }

  /**
   * PUT /batches/:id
   * Update batch
   */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBatchDto: UpdateBatchDto,
    @Request() req: any,
  ): Promise<any> {
    return this.batchesService.update(id, updateBatchDto, req.user?.username || 'system');
  }

  /**
   * DELETE /batches/:id
   * Soft delete batch
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<void> {
    return this.batchesService.remove(id, req.user?.username || 'system');
  }

  /**
   * GET /batches/:id/details
   * Get batch details (ship costs, customs, tracking)
   */
  @Get(':id/details')
  async findDetails(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.batchesService.findDetails(id);
  }

  /**
   * GET /batches/:id/costs
   * Get batch costs (ChiPhiLoHang)
   */
  @Get(':id/costs')
  async findCosts(@Param('id', ParseIntPipe) id: number): Promise<any[]> {
    return this.batchesService.findCosts(id);
  }

  /**
   * POST /batches/:id/costs
   * Add batch cost
   */
  @Post(':id/costs')
  async addCost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { loaiChiPhiLoHangId: number; tienVnd: number },
    @Request() req: any,
  ): Promise<any> {
    return this.batchesService.addCost(id, body.loaiChiPhiLoHangId, body.tienVnd, req.user?.username || 'system');
  }

  /**
   * PUT /batches/:id/costs/:costId
   * Update batch cost
   */
  @Put(':id/costs/:costId')
  async updateCost(
    @Param('id', ParseIntPipe) id: number,
    @Param('costId', ParseIntPipe) costId: number,
    @Body() body: { loaiChiPhiLoHangId: number; tienVnd: number },
    @Request() req: any,
  ): Promise<any> {
    return this.batchesService.updateCost(costId, body.loaiChiPhiLoHangId, body.tienVnd, req.user?.username || 'system');
  }

  /**
   * DELETE /batches/:id/costs/:costId
   * Delete batch cost
   */
  @Delete(':id/costs/:costId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCost(
    @Param('id', ParseIntPipe) id: number,
    @Param('costId', ParseIntPipe) costId: number,
    @Request() req: any,
  ): Promise<void> {
    return this.batchesService.deleteCost(costId, req.user?.username || 'system');
  }

  /**
   * GET /batches/:id/ship-costs
   * Get batch ship to VN costs
   */
  @Get(':id/ship-costs')
  async findShipCosts(@Param('id', ParseIntPipe) id: number): Promise<any[]> {
    return this.batchesService.findShipCosts(id);
  }

  /**
   * POST /batches/:id/ship-costs
   * Add batch ship cost
   */
  @Post(':id/ship-costs')
  async addShipCost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { loaiHangShipId: number; canNang: number; donGia: number; tongTienShipVnd: number },
    @Request() req: any,
  ): Promise<any> {
    return this.batchesService.addShipCost(id, body.loaiHangShipId, body.canNang, body.donGia, body.tongTienShipVnd, req.user?.username || 'system');
  }

  /**
   * PUT /batches/:id/ship-costs/:shipCostId
   * Update batch ship cost
   */
  @Put(':id/ship-costs/:shipCostId')
  async updateShipCost(
    @Param('id', ParseIntPipe) id: number,
    @Param('shipCostId', ParseIntPipe) shipCostId: number,
    @Body() body: { loaiHangShipId: number; canNang: number; donGia: number; tongTienShipVnd: number },
    @Request() req: any,
  ): Promise<any> {
    return this.batchesService.updateShipCost(shipCostId, body.loaiHangShipId, body.canNang, body.donGia, body.tongTienShipVnd, req.user?.username || 'system');
  }

  /**
   * DELETE /batches/:id/ship-costs/:shipCostId
   * Delete batch ship cost
   */
  @Delete(':id/ship-costs/:shipCostId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteShipCost(
    @Param('id', ParseIntPipe) id: number,
    @Param('shipCostId', ParseIntPipe) shipCostId: number,
    @Request() req: any,
  ): Promise<void> {
    return this.batchesService.deleteShipCost(shipCostId, req.user?.username || 'system');
  }

  /**
   * GET /batches/:id/customs
   * Get batch customs (ThueHaiQuan)
   */
  @Get(':id/customs')
  async findCustoms(@Param('id', ParseIntPipe) id: number): Promise<any[]> {
    return this.batchesService.findCustoms(id);
  }

  /**
   * POST /batches/:id/customs
   * Add batch customs
   */
  @Post(':id/customs')
  async addCustoms(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { loaiHangThueHaiQuanId: number; canNangSoLuongGiaTri: number; donGia: number; tongTienThueHaiQuanVnd: number },
    @Request() req: any,
  ): Promise<any> {
    return this.batchesService.addCustoms(id, body.loaiHangThueHaiQuanId, body.canNangSoLuongGiaTri, body.donGia, body.tongTienThueHaiQuanVnd, req.user?.username || 'system');
  }

  /**
   * PUT /batches/:id/customs/:customsId
   * Update batch customs
   */
  @Put(':id/customs/:customsId')
  async updateCustoms(
    @Param('id', ParseIntPipe) id: number,
    @Param('customsId', ParseIntPipe) customsId: number,
    @Body() body: { loaiHangThueHaiQuanId: number; canNangSoLuongGiaTri: number; donGia: number; tongTienThueHaiQuanVnd: number },
    @Request() req: any,
  ): Promise<any> {
    return this.batchesService.updateCustoms(customsId, body.loaiHangThueHaiQuanId, body.canNangSoLuongGiaTri, body.donGia, body.tongTienThueHaiQuanVnd, req.user?.username || 'system');
  }

  /**
   * DELETE /batches/:id/customs/:customsId
   * Delete batch customs
   */
  @Delete(':id/customs/:customsId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustoms(
    @Param('id', ParseIntPipe) id: number,
    @Param('customsId', ParseIntPipe) customsId: number,
    @Request() req: any,
  ): Promise<void> {
    return this.batchesService.deleteCustoms(customsId, req.user?.username || 'system');
  }
}
