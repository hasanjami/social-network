package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// saves an uploaded image to disk, returns the URL path or empty string if no file
func saveImage(r *http.Request, field string, folder string) (string, error) {
	file, header, err := r.FormFile(field)
	if err != nil {
		return "", nil // no file is fine
	}
	defer file.Close()

	// read first 512 bytes to figure out the type
	buff := make([]byte, 512)
	if _, err := file.Read(buff); err != nil {
		return "", fmt.Errorf("can't read file")
	}
	file.Seek(0, 0)

	contentType := http.DetectContentType(buff)
	extMap := map[string]string{
		"image/jpeg": "jpg",
		"image/png":  "png",
		"image/gif":  "gif",
	}

	ext, ok := extMap[contentType]
	if !ok {
		return "", fmt.Errorf("only JPEG, PNG and GIF allowed")
	}

	if header.Size > 5<<20 {
		return "", fmt.Errorf("file too large, max 5MB")
	}

	// keep the original extension if it makes sense
	origExt := strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), "."))
	if origExt == "jpeg" {
		origExt = "jpg"
	}
	if origExt == "jpg" || origExt == "png" || origExt == "gif" {
		ext = origExt
	}

	name := fmt.Sprintf("%s_%d.%s", folder, time.Now().UnixNano(), ext)
	dir := "./pkg/db/uploads/" + folder + "/"

	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("can't create upload folder")
	}

	dst, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		return "", fmt.Errorf("can't save file")
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		return "", fmt.Errorf("can't save file")
	}

	return "/uploads/" + folder + "/" + name, nil
}
