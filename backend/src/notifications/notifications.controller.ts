import { Controller, Get, Patch, Param, Query, Request, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { NotificationsQueryDto } from './dto/notifications-query.dto';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Notifications Controller
 *
 * All routes are scoped to the authenticated user (username from JWT).
 * Users can only read/update their own notifications.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@MienQuyen('rieng')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET /notifications — paginated list, unread first */
  @Get()
  async getList(@Request() req: any, @Query() query: NotificationsQueryDto) {
    return this.notificationsService.getByUsername(
      req.user.username,
      query.page,
      query.limit,
    );
  }

  /** GET /notifications/unread-count?type=debt — badge count, optional type filter */
  @Get('unread-count')
  async getUnreadCount(@Request() req: any, @Query('type') type?: string) {
    const count = await this.notificationsService.getUnreadCount(req.user.username, type);
    return { count };
  }

  /** PATCH /notifications/read-all?type=debt — mark all as read, optional type filter */
  @Patch('read-all')
  async markAllRead(@Request() req: any, @Query('type') type?: string) {
    await this.notificationsService.markAllRead(req.user.username, type);
    return { success: true };
  }

  /** PATCH /notifications/:id/read — mark single notification as read */
  @Patch(':id/read')
  async markRead(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    await this.notificationsService.markRead(id, req.user.username);
    return { success: true };
  }
}
