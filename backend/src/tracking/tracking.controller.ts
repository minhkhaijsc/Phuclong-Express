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
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
} from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { CreateTrackingDto } from './dto/create-tracking.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { QueryTrackingDto } from './dto/query-tracking.dto';
import { MassUpdateTrackingDto } from './dto/mass-update-tracking.dto';
import {
  ImportTrackingDto,
  ImportTrackingResult,
} from './dto/import-tracking.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
interface AuthenticatedRequest {
  user?: {
    username?: string;
  };
}

/**
 * Tracking Controller
 *
 * Handles tracking CRUD endpoints.
 *
 * Endpoints:
 * - GET /tracking - List tracking with filters and pagination
 * - GET /tracking/counts - Get tracking counts by status
 * - GET /tracking/:id - Get tracking by ID
 * - POST /tracking - Create new tracking
 * - PUT /tracking/:id - Update tracking
 * - DELETE /tracking/:id - Soft delete tracking
 * - POST /tracking/mass-delete - Mass delete tracking
 * - POST /tracking/mass-status - Mass update status
 * - POST /tracking/mass-complete - Mass complete tracking
 * - GET /tracking/:id/details - Get tracking details
 * - GET /tracking/:id/history - Get tracking status history
 * - POST /tracking/:id/history - Add tracking status
 */
@UseGuards(JwtAuthGuard)
@Controller('tracking')
@MienQuyen('vanChuyen')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  /**
   * GET /tracking
   * List tracking with filters and pagination
   */
  @Get()
  async findAll(
    @Query() query: QueryTrackingDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    return this.trackingService.findAll(query);
  }

  /**
   * GET /tracking/counts
   * Get tracking counts by status
   */
  @Get('counts')
  async getCounts(@Query('username') username?: string): Promise<any> {
    return this.trackingService.getCounts(username);
  }

  /**
   * GET /tracking/users
   * Get list of users for dropdown (Tracking_ThemSua form)
   */
  @Get('dropdown/users')
  async getUsers(): Promise<any> {
    return this.trackingService.getUsers();
  }

  /**
   * GET /tracking/nha-van-chuyen
   * Get list of shipping providers for dropdown (Tracking_ThemSua form)
   */
  @Get('dropdown/nha-van-chuyen')
  async getNhaVanChuyen(): Promise<any> {
    return this.trackingService.getNhaVanChuyen();
  }

  /**
   * GET /tracking/search/:code
   * Public endpoint to search tracking by code
   */
  @Public()
  @Get('search/:code')
  async searchByCode(@Param('code') code: string): Promise<any> {
    return this.trackingService.searchByCode(code);
  }

  /**
   * GET /tracking/:id
   * Get tracking by ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.trackingService.findOne(id);
  }

  /**
   * POST /tracking
   * Create new tracking
   */
  @Post()
  async create(@Body() createTrackingDto: CreateTrackingDto): Promise<any> {
    return this.trackingService.create(createTrackingDto);
  }

  /**
   * PUT /tracking/:id
   * Update tracking
   */
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTrackingDto: UpdateTrackingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    return this.trackingService.update(
      id,
      updateTrackingDto,
      req.user?.username,
    );
  }

  /**
   * DELETE /tracking/:id
   * Soft delete tracking
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.trackingService.remove(id, req.user?.username);
  }

  /**
   * POST /tracking/mass-delete
   * Mass delete tracking
   */
  @UseGuards(JwtAuthGuard)
  @Post('mass-delete')
  @HttpCode(HttpStatus.OK)
  async massDelete(
    @Body() body: { ids: number[]; nguoiTao?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ deleted: number }> {
    return this.trackingService.massDelete(body.ids, req.user?.username || body.nguoiTao || 'system');
  }

  /**
   * POST /tracking/mass-status
   * Mass update status
   */
  @UseGuards(JwtAuthGuard)
  @Post('mass-status')
  @HttpCode(HttpStatus.OK)
  async massStatus(
    @Body() massUpdateDto: MassUpdateTrackingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ updated: number }> {
    massUpdateDto.nguoiTao = req.user?.username || massUpdateDto.nguoiTao || 'system';
    return this.trackingService.massStatus(massUpdateDto);
  }

  /**
   * POST /tracking/mass-complete
   * Mass complete tracking
   */
  @UseGuards(JwtAuthGuard)
  @Post('mass-complete')
  @HttpCode(HttpStatus.OK)
  async massComplete(
    @Body() body: { ids: number[]; nguoiTao?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ updated: number }> {
    return this.trackingService.massComplete(body.ids, req.user?.username || body.nguoiTao || 'system');
  }

  /**
   * POST /tracking/mass-complete-all
   * Mass complete tracking with filters
   */
  @UseGuards(JwtAuthGuard)
  @Post('mass-complete-all')
  @HttpCode(HttpStatus.OK)
  async massCompleteAll(
    @Body() body: { query: QueryTrackingDto; nguoiTao?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ updated: number }> {
    return this.trackingService.massCompleteAll(body.query, req.user?.username || body.nguoiTao || 'system');
  }

  /**
   * GET /tracking/:id/details
   * Get tracking details
   */
  @Get(':id/details')
  async findDetails(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.trackingService.findDetails(id);
  }

  /**
   * GET /tracking/:id/history
   * Get tracking status history
   */
  @Get(':id/history')
  async findHistory(@Param('id', ParseIntPipe) id: number): Promise<any[]> {
    return this.trackingService.findHistory(id);
  }

  /**
   * POST /tracking/:id/history
   * Add tracking status
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/history')
  async addHistory(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ghiChu: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    return this.trackingService.addHistory(id, body.ghiChu, req.user?.username || 'system');
  }

  /**
   * PUT /tracking/:id/history/:historyId
   * Update tracking status
   */
  @UseGuards(JwtAuthGuard)
  @Put(':id/history/:historyId')
  async updateHistory(
    @Param('id', ParseIntPipe) id: number,
    @Param('historyId', ParseIntPipe) historyId: number,
    @Body() body: { ghiChu: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    const nguoiTao = req.user?.username || 'system';
    return this.trackingService.updateHistory(historyId, body.ghiChu, nguoiTao);
  }

  /**
   * DELETE /tracking/:id/history/:historyId
   * Delete tracking status
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id/history/:historyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHistory(
    @Param('id', ParseIntPipe) id: number,
    @Param('historyId', ParseIntPipe) historyId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const nguoiTao = req.user?.username || 'system';
    return this.trackingService.deleteHistory(historyId, nguoiTao);
  }

  /**
   * POST /tracking/:id/chi-tiet
   * Add chi tiet tracking
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/chi-tiet')
  async addChiTiet(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      linkHinh: string;
      soLuong: number;
      gia: number;
      ghiChu: string;
      nguoiTao?: string;
    },
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    return this.trackingService.addChiTiet(
      id,
      body.linkHinh,
      body.soLuong,
      body.gia,
      body.ghiChu,
      req.user?.username || body.nguoiTao || 'system',
    );
  }

  /**
   * PUT /tracking/:id/chi-tiet/:chiTietId
   * Update chi tiet tracking
   */
  @UseGuards(JwtAuthGuard)
  @Put(':id/chi-tiet/:chiTietId')
  async updateChiTiet(
    @Param('id', ParseIntPipe) id: number,
    @Param('chiTietId', ParseIntPipe) chiTietId: number,
    @Body()
    body: {
      linkHinh: string;
      soLuong: number;
      gia: number;
      ghiChu: string;
      nguoiTao?: string;
    },
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    return this.trackingService.updateChiTiet(
      chiTietId,
      body.linkHinh,
      body.soLuong,
      body.gia,
      body.ghiChu,
      id,
      req.user?.username || body.nguoiTao || 'system',
    );
  }

  /**
   * DELETE /tracking/:id/chi-tiet/:chiTietId
   * Delete chi tiet tracking
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id/chi-tiet/:chiTietId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChiTiet(
    @Param('id', ParseIntPipe) id: number,
    @Param('chiTietId', ParseIntPipe) chiTietId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.trackingService.deleteChiTiet(chiTietId, id, req.user?.username || 'system');
  }

  /**
   * POST /tracking/import/sheets
   * Get sheets from uploaded Excel file (Tracking_Import.aspx Step 1)
   */
  @Post('import/sheets')
  @UseInterceptors(FileInterceptor('file'))
  async getSheets(@UploadedFile() file: any) {
    return this.trackingService.getExcelSheets(file);
  }

  /**
   * POST /tracking/import
   * Validate + optionally persist tracking rows from an Excel file.
   * Converted from Tracking_Import.aspx Steps 2-4 (sheet pick, validation, save).
   *
   * Multipart body fields:
   *   file        — .xlsx upload
   *   sheetName   — sheet to read
   *   mode        — '1' for edit, anything else creates new rows
   *   editColumns — CSV of column indices to overwrite (edit mode only)
   *   commit      — 'true' to persist; otherwise returns dry-run preview
   */
  @UseGuards(JwtAuthGuard)
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async importTracking(
    @UploadedFile() file: any,
    @Body() dto: ImportTrackingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ImportTrackingResult> {
    return this.trackingService.importTracking(file, dto, req.user?.username);
  }
}
