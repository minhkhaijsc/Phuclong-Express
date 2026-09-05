-- Migration: Create Articles table
-- Bang bai viet cho trang tin tuc. Chay mot lan tren MSSQL truoc khi deploy module articles.
--
-- Ghi chu ve SEO:
--   Slug la duong dan bai viet tren web (vd /tin-tuc/bang-gia-van-chuyen-2026) nen phai
--   duy nhat. MetaTitle/MetaDescription la thu Google hien tren ket qua tim kiem.
--   Og* dung khi chia se len Facebook/Zalo. Noindex de an bai khoi ket qua tim kiem.

-- Bat buoc phai bat truoc khi tao filtered index (menh de WHERE o CREATE INDEX ben duoi).
-- sqlcmd mac dinh de QUOTED_IDENTIFIER OFF, chay thang se bao loi 1934 va bo qua
-- toan bo chi muc — bang van tao ra nhung khong co rang buoc chong trung slug.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'Articles' AND xtype = 'U')
BEGIN
  CREATE TABLE Articles (
    Id              INT             IDENTITY(1,1) PRIMARY KEY,
    Title           NVARCHAR(255)   NOT NULL,
    Slug            NVARCHAR(255)   NOT NULL,
    Content         NVARCHAR(MAX)   NOT NULL,
    Excerpt         NVARCHAR(500)   NULL,
    Thumbnail       NVARCHAR(500)   NULL,
    Author          NVARCHAR(100)   NULL,
    ArticleType     NVARCHAR(50)    NOT NULL CONSTRAINT DF_Articles_Type      DEFAULT 'tin-tuc',
    Published       BIT             NOT NULL CONSTRAINT DF_Articles_Published DEFAULT 0,
    PublishedAt     DATETIME        NULL,

    -- SEO
    MetaTitle       NVARCHAR(255)   NULL,
    MetaDescription NVARCHAR(500)   NULL,
    FocusKeyword    NVARCHAR(255)   NULL,
    CanonicalUrl    NVARCHAR(500)   NULL,
    OgTitle         NVARCHAR(255)   NULL,
    OgDescription   NVARCHAR(500)   NULL,
    OgImage         NVARCHAR(500)   NULL,
    Noindex         BIT             NOT NULL CONSTRAINT DF_Articles_Noindex   DEFAULT 0,

    ViewCount       INT             NOT NULL CONSTRAINT DF_Articles_ViewCount DEFAULT 0,
    CreatedAt       DATETIME        NOT NULL CONSTRAINT DF_Articles_CreatedAt DEFAULT GETDATE(),
    CreatedBy       NVARCHAR(100)   NULL,
    UpdatedAt       DATETIME        NULL,
    UpdatedBy       NVARCHAR(100)   NULL,
    IsDeleted       BIT             NOT NULL CONSTRAINT DF_Articles_IsDeleted DEFAULT 0
  );

  -- Slug phai duy nhat trong so bai chua xoa. Dung filtered index thay vi UNIQUE thuong
  -- de xoa mem roi van tao lai bai khac cung slug duoc.
  CREATE UNIQUE INDEX UX_Articles_Slug ON Articles (Slug) WHERE IsDeleted = 0;

  -- Trang danh sach cong khai loc theo Published + ArticleType, sap xep moi nhat truoc.
  CREATE INDEX IX_Articles_Published ON Articles (Published, IsDeleted, PublishedAt DESC);
  CREATE INDEX IX_Articles_Type      ON Articles (ArticleType, Published, IsDeleted);

  PRINT 'Articles table created successfully.';
END
ELSE
BEGIN
  PRINT 'Articles table already exists - skipping.';
END
