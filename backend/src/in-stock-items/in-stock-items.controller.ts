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
import { InStockItemsService } from './in-stock-items.service';
import { InStockItem } from './entities/in-stock-item.entity';
import { CreateInStockItemDto } from './dto/create-in-stock-item.dto';
import { UpdateInStockItemDto } from './dto/update-in-stock-item.dto';
import { QueryInStockItemDto } from './dto/query-in-stock-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * In-Stock Items Controller
 *
 * Endpoints:
 * - GET /in-stock-items - List in-stock items with filters
 * - GET /in-stock-items/:id - Get in-stock item by ID
 * - POST /in-stock-items - Create new in-stock item
 * - PUT /in-stock-items/:id - Update in-stock item
 * - DELETE /in-stock-items/:id - Delete in-stock item
 */
@Controller('in-stock-items')
@MienQuyen('muaHang')
export class InStockItemsController {
  constructor(private readonly inStockItemsService: InStockItemsService) {}

  /**
   * GET /in-stock-items
   */
  @Get()
  async findAll(
    @Query() query: QueryInStockItemDto,
  ): Promise<{ data: InStockItem[]; total: number; page: number; limit: number }> {
    return this.inStockItemsService.findAll(query);
  }

  /**
   * GET /in-stock-items/:id
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InStockItem> {
    return this.inStockItemsService.findOne(id);
  }

  /**
   * POST /in-stock-items
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createInStockItemDto: CreateInStockItemDto,
    @Request() req: any,
  ): Promise<InStockItem> {
    return this.inStockItemsService.create(createInStockItemDto, req.user?.username || 'system');
  }

  /**
   * PUT /in-stock-items/:id
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateInStockItemDto: UpdateInStockItemDto,
    @Request() req: any,
  ): Promise<InStockItem> {
    return this.inStockItemsService.update(id, updateInStockItemDto, req.user?.username || 'system');
  }

  /**
   * DELETE /in-stock-items/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ): Promise<void> {
    return this.inStockItemsService.remove(id, req.user?.username || 'system');
  }
}
