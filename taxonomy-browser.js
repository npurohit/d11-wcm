(function (Drupal) {
  'use strict';

  // Listen for backend-triggered refresh events to force a page reload with a
  // cache-busting query param so counts update immediately after modal actions.
  // DOM event (custom) dispatch support.
  const forceRefresh = (urlOverride) => {
    const url = urlOverride ? new URL(urlOverride, window.location.origin) : new URL(window.location.href);
    url.searchParams.set('refresh', Date.now().toString());
    const target = url.toString();
    // Reload within the current frame (iframe) instead of top frame
    window.location.replace(target);
    setTimeout(() => window.location.reload(), 50);
  };

  // Fallback: if the page regains focus after a modal upload/creation, force a one-time reload.
  // Use sessionStorage to avoid infinite loops.
  const focusReloadKey = 'taxonomyBrowserFocusReload';
  if (!sessionStorage.getItem(focusReloadKey)) {
    window.addEventListener('focus', () => {
      // Guard to only reload on the taxonomy overview path.
      if (window.location.pathname.includes('/group/') && window.location.pathname.includes('/overview')) {
        sessionStorage.setItem(focusReloadKey, 'done');
        forceRefresh();
      }
    }, { once: true });
  }

  document.addEventListener('taxonomyBrowserRefresh', (e) => forceRefresh(e.detail || undefined), { once: false });

  // jQuery-triggered event support (Ajax InvokeCommand uses jQuery trigger).
  if (window.jQuery) {
    window.jQuery(document).on('taxonomyBrowserRefresh', (event, urlOverride) => forceRefresh(urlOverride));
  }

  // Drupal Ajax command: taxonomyBrowserForceReload
  Drupal.AjaxCommands.prototype.taxonomyBrowserForceReload = function (ajax, response, status) {
    forceRefresh(response && response.url ? response.url : undefined);
  };

  // Hook into Drupal's default AlertCommand so that after the user dismisses
  // the alert, we trigger a refresh of the overview page to update counts.
  const originalAlertCommand = Drupal.AjaxCommands.prototype.alert;
  Drupal.AjaxCommands.prototype.alert = function (ajax, response, status) {
    if (originalAlertCommand) {
      originalAlertCommand.call(this, ajax, response, status);
    } else if (response && response.text) {
      window.alert(response.text);
    }
    // After the alert is dismissed, refresh the taxonomy overview so tree counts update.
    setTimeout(() => {
      if (window.location.pathname.includes('/group/') && window.location.pathname.includes('/overview')) {
        forceRefresh();
      }
    }, 50);
  };

  /**
   * Attach behavior to taxonomy browser term links.
   */
  Drupal.behaviors.taxonomyBrowser = {
    attach: function (context) {
      const termLinks = context.querySelectorAll('.taxonomy-term-link');
      const searchInput = document.getElementById('term-file-search');
      let selectedTermData = null;
      let searchDebounceTimer = null;
      let lastSearchRequestId = 0;

      function getCurrentGroupId() {
        const pathParts = window.location.pathname.split('/');
        const groupIndex = pathParts.indexOf('group');
        return groupIndex >= 0 ? pathParts[groupIndex + 1] : null;
      }

 function resetToSelectedOrEmpty() {
        if (selectedTermData) {
          renderTermContent(selectedTermData, false);
          return;
        }

        const titleEl = document.getElementById('selected-term-title');
        const countEl = document.getElementById('term-item-count');
        const contentEl = document.getElementById('term-content-list');

        // ADD CHECKS HERE
        if (titleEl) titleEl.textContent = Drupal.t('File Search');
        if (countEl) countEl.textContent = '';
        if (contentEl) {
          contentEl.innerHTML = '<p class="empty-state">' + Drupal.t('No folder selected') + '</p>';
        }
      }


      function runGroupWideSearch(rawQuery) {
        const query = (rawQuery || '').trim();
        if (!query) {
          resetToSelectedOrEmpty();
          return;
        }

        const groupId = getCurrentGroupId();
        if (!groupId) {
          return;
        }

        const requestId = ++lastSearchRequestId;
        fetch(`/api/group/${groupId}/search/files?q=${encodeURIComponent(query)}`)
          .then((response) => {
            if (!response.ok) {
              throw new Error('Failed to search files');
            }
            return response.json();
          })
          .then((data) => {
            if (requestId !== lastSearchRequestId) {
              return;
            }
            renderTermContent(data, true);
          })
          .catch((error) => {
            console.error('Search error:', error);
          });
      }

      if (searchInput && !searchInput.hasAttribute('data-file-search-initialized')) {
        searchInput.setAttribute('data-file-search-initialized', 'true');
        searchInput.addEventListener('input', () => {
          if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
          }

          const query = searchInput.value || '';
          searchDebounceTimer = setTimeout(() => runGroupWideSearch(query), 250);
        });
      }
      
      termLinks.forEach((link) => {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          
          // Get the term ID from the parent li data attribute
          const termLi = this.closest('[data-tid]');
          if (!termLi) return;
          
          const termId = termLi.dataset.tid;
          if (!termId) return;

          const groupId = getCurrentGroupId();
          if (!groupId) return;
          
          // Fetch term content via AJAX
          fetch(`/api/group/${groupId}/term/${termId}/content`)
            .then((response) => {
              if (!response.ok) {
                throw new Error('Failed to load content');
              }
              return response.json();
            })
            .then((data) => {
              displayTermContent(data);
            })
            .catch((error) => {
            console.error('Error:', error);
  
            const contentEl = document.getElementById('term-content-list');
            if (contentEl) {
                contentEl.innerHTML = '<p class="error">' + Drupal.t('Failed to load content') + '</p>';
               }
          });
        });
      });
      
      /**
       * Display term content on the right side.
       */
      function displayTermContent(data) {
        selectedTermData = data;
        if (searchInput) {
          searchInput.value = '';
        }
        renderTermContent(data, false);
      }

           /**
       * Render right-side content.
       */
      function renderTermContent(data, isSearchResults) {
        const titleEl = document.getElementById('selected-term-title');
        const countEl = document.getElementById('term-item-count');
        const contentEl = document.getElementById('term-content-list');
        
        // Essential check: If the content list container is missing, we can't render anything.
        if (!contentEl) {
          return;
        }

        const termNodes = Array.isArray(data.nodes) ? data.nodes : [];
        
        // Set title safely
        if (titleEl) {
          titleEl.textContent = data.term_name || (isSearchResults ? Drupal.t('Search Results') : '');
        }
        
        // Set count safely
        if (countEl) {
          countEl.textContent = `(${termNodes.length} ${termNodes.length === 1 ? 'item' : 'items'})`;
        }
        
        // Build content list
        if (termNodes.length > 0) {
          const html = termNodes.map((node) => {
            const date = new Date(node.created * 1000);
            const formattedDate = date.toLocaleDateString();
            return `
              <div class="term-content-item" data-nid="${node.nid}">
                <div class="item-actions">
                  <button class="file-hamburger-menu-btn" type="button" aria-label="${Drupal.t('Actions for')} ${escapeHtml(node.title)}" aria-expanded="false">
                    <span class="hamburger-dots">⋮</span>
                  </button>
                  <div class="file-hamburger-menu" role="menu" aria-hidden="true">
                    <div class="file-hamburger-menu-content">
                      <button class="file-delete-btn hamburger-menu-item" data-nid="${node.nid}" role="menuitem">
                        <span class="menu-icon">🗑️</span>
                        ${Drupal.t('Delete File')}
                      </button>
                    </div>
                  </div>
                </div>
                <div class="item-files-middle">
                  ${Array.isArray(node.files) && node.files.length > 0 ? `
                    <div class="item-file-links">
                      ${node.files.map((file) => `
                        <a class="file-icon-link file-icon-link--small" href="${escapeHtml(file.url)}" download title="${escapeHtml(file.name)}">
                          <span class="file-icon" aria-hidden="true">📄</span>
                          <span class="item-file-name">${escapeHtml(file.name)}</span>
                        </a>
                      `).join('')}
                    </div>
                  ` : (node.download_path ? `
                    <div class="item-file-links">
                      <a class="file-icon-link file-icon-link--small" href="${escapeHtml(node.download_path)}" download title="${escapeHtml(extractFileName(node.download_path, node.title))}">
                        <span class="file-icon" aria-hidden="true">📄</span>
                        <span class="item-file-name">${escapeHtml(extractFileName(node.download_path, node.title))}</span>
                      </a>
                    </div>
                  ` : `<span class="item-title">${escapeHtml(node.title)}</span>`)}
                </div>
                ${isSearchResults && node.collection_name ? `
                  <div class="item-collection">${Drupal.t('Folder:')} ${escapeHtml(node.collection_name)}</div>
                ` : ''}
                <div class="item-footer">
                  <span class="item-author">${Drupal.t('Uploaded by:')} ${escapeHtml(node.author || Drupal.t('Unknown'))}</span>
                  <span class="item-date">${Drupal.t('Created:')} ${formattedDate}</span>
                </div>
              </div>
            `;
          }).join('');
          
          contentEl.innerHTML = html;
          
          // Initialize hamburger menus for file actions
          if (typeof initFileHamburgerMenus === 'function') {
            initFileHamburgerMenus(context);
          }
        } else {
          contentEl.innerHTML = isSearchResults
            ? '<p class="empty-state">' + Drupal.t('No files match your search') + '</p>'
            : '<p class="empty-state">' + Drupal.t('No content in this folder') + '</p>';
        }
      }
      
      /**
       * Escape HTML special characters.
       */
      function extractFileName(path, fallback) {
        if (!path || typeof path !== 'string') {
          return fallback || '';
        }
        try {
          const cleanPath = path.split('?')[0].split('#')[0];
          const segments = cleanPath.split('/').filter(Boolean);
          const lastSegment = segments.length ? segments[segments.length - 1] : '';
          return decodeURIComponent(lastSegment || fallback || '');
        } catch (e) {
          return fallback || '';
        }
      }

      function escapeHtml(unsafe) {
        const div = document.createElement('div');
        div.textContent = unsafe;
        return div.innerHTML;
      }
      
      /**
       * Initialize hamburger menus for file actions.
       */
      function initFileHamburgerMenus(context) {
        const hamburgerButtons = context.querySelectorAll('.file-hamburger-menu-btn');
        
        hamburgerButtons.forEach((button) => {
          // Skip if already initialized
          if (button.hasAttribute('data-hamburger-initialized')) {
            return;
          }
          
          const menu = button.nextElementSibling;
          if (!menu || !menu.classList.contains('file-hamburger-menu')) {
            return;
          }

          // Mark as initialized
          button.setAttribute('data-hamburger-initialized', 'true');

          // Handle button click
          button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFileMenu(button, menu);
          });

          // Handle keyboard navigation
          button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleFileMenu(button, menu);
            } else if (e.key === 'Escape') {
              closeFileMenu(button, menu);
            }
          });

          // Handle menu item keyboard navigation
          const menuItems = menu.querySelectorAll('.hamburger-menu-item');
          menuItems.forEach((item, index) => {
            item.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') {
                closeFileMenu(button, menu);
                button.focus();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextItem = menuItems[index + 1] || menuItems[0];
                nextItem.focus();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevItem = menuItems[index - 1] || menuItems[menuItems.length - 1];
                prevItem.focus();
              }
            });
            
            // Handle delete button click
            if (item.classList.contains('file-delete-btn')) {
              item.addEventListener('click', (e) => {
                e.preventDefault();
                handleFileDelete(item.dataset.nid, item.closest('.term-content-item'));
                closeFileMenu(button, menu);
              });
            }
          });
        });

        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
          if (!e.target.closest('.item-actions')) {
            closeAllFileMenus(context);
          }
        });
      }
      
      function toggleFileMenu(button, menu) {
        const isOpen = menu.classList.contains('show');
        
        // Close all other open menus
        closeAllFileMenus(document);
        
        if (!isOpen) {
          openFileMenu(button, menu);
        }
      }

      function openFileMenu(button, menu) {
        button.setAttribute('aria-expanded', 'true');
        menu.classList.add('show');
        menu.setAttribute('aria-hidden', 'false');
        
        // Focus first menu item
        const firstMenuItem = menu.querySelector('.hamburger-menu-item');
        if (firstMenuItem) {
          setTimeout(() => firstMenuItem.focus(), 100);
        }
      }

      function closeFileMenu(button, menu) {
        button.setAttribute('aria-expanded', 'false');
        menu.classList.remove('show');
        menu.setAttribute('aria-hidden', 'true');
      }

      function closeAllFileMenus(context) {
        const openMenus = context.querySelectorAll('.file-hamburger-menu.show');
        openMenus.forEach((menu) => {
          const button = menu.previousElementSibling;
          if (button && button.classList.contains('file-hamburger-menu-btn')) {
            closeFileMenu(button, menu);
          }
        });
      }
      
      function handleFileDelete(nodeId, contentItem) {
        if (!nodeId || !contentItem) return;

        const titleEl = contentItem.querySelector('.item-title') || contentItem.querySelector('a');
        const fileName = titleEl ? titleEl.textContent.trim() : Drupal.t('this file');
        
        // Enhanced confirmation dialog
        const confirmMessage = `Are you sure you want to delete the file(s)"?\n\n` +
                              `This will permanently remove:\n` +
                              `• The file(s) from the system\n` +
                              `• All associated data\n\n` +
                              `This action cannot be undone.`;
        
        if (!confirm(confirmMessage)) {
          return;
        }
        
        // Get the group ID from the URL
        const pathParts = window.location.pathname.split('/');
        const groupIndex = pathParts.indexOf('group');
        const groupId = pathParts[groupIndex + 1];
        
        // Show loading state
        contentItem.style.opacity = '0.6';
        contentItem.style.pointerEvents = 'none';
        
        fetch(`/group/${groupId}/file/${nodeId}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'same-origin'
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to delete file');
          }
          return response.json();
        })
        .then(data => {
          if (data.success) {
            // Remove the item with animation
            contentItem.style.transition = 'all 0.3s ease';
            contentItem.style.transform = 'translateX(-100%)';
            contentItem.style.opacity = '0';
            
            setTimeout(() => {
              contentItem.remove();
              
              // Update count in the right panel immediately.
              const countEl = document.getElementById('term-item-count');
              const contentListEl = document.getElementById('term-content-list');
              const remainingItems = contentListEl.querySelectorAll('.term-content-item');
              
              if (remainingItems.length === 0) {
                contentListEl.innerHTML = '<p class="empty-state">No content in this folder</p>';
                countEl.textContent = '(0 items)';
              } else {
                countEl.textContent = `(${remainingItems.length} ${remainingItems.length === 1 ? 'item' : 'items'})`;
              }

              // Force-refresh the overview so the left tree counts stay in sync.
              const refreshUrl = groupId ? '/group/' + groupId + '/overview?refresh=' + Date.now() : window.location.href;
              setTimeout(() => forceRefresh(refreshUrl), 150);
            }, 300);
          } else {
            throw new Error(data.message || 'Failed to delete file');
          }
        })
        .catch(error => {
          console.error('Delete error:', error);
          
          // Restore item state
          contentItem.style.opacity = '';
          contentItem.style.pointerEvents = '';
          
          alert('Failed to delete file. Please try again.');
        });
      }
    }
  };

    /**
   * File Upload Form Override Behavior
   */
  Drupal.behaviors.fileUploadOverride = {
    attach: function (context) {
      // 1. Guard against multiple attachments
      // We only want to set the observer once on the whole document.
      if (context !== document) {
        return;
      }
      
      const body = document.body;
      if (body.hasAttribute('data-file-override-initialized')) {
        return;
      }
      body.setAttribute('data-file-override-initialized', 'true');

      console.log('File upload override behavior attached');

      // 2. Define the observer
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if the node is a dialog or contains one
                if (node.classList.contains('ui-dialog') || node.querySelector('.ui-dialog')) {
                  console.log('Modal dialog detected, intercepting forms');
                  setTimeout(() => {
                    if (typeof interceptModalForms === 'function') {
                      interceptModalForms();
                    }
                  }, 150);
                }
              }
            });
          }
        });
      });


      
      // 4. Check immediately for existing modals (Safety check)
      if (typeof interceptModalForms === 'function') {
        interceptModalForms();
      } else {
        console.warn('interceptModalForms is not defined when script loaded.');
      }

      
      function interceptModalForms() {
        // Find all forms in modal dialogs
        const modalForms = document.querySelectorAll('.ui-dialog form, .ui-dialog-content form');
        
        modalForms.forEach(form => {
          // Skip if already processed
          if (form.hasAttribute('data-upload-intercepted')) {
            return;
          }
          
          // Check if this looks like a file upload form
          const hasFileField = form.querySelector('input[type="file"]') !== null;
          const hasUploadField = form.querySelector('[name*="file_upload"], [name*="field_file_upload"]') !== null;
          // Restrict interception strictly to real file upload forms; do not rely on group markers.
          const isGroupForm = false;
          
          console.log('Form analysis:', { 
            hasFileField, 
            hasUploadField, 
            isGroupForm, 
            action: form.action,
            id: form.id 
          });
          
          if (hasFileField || hasUploadField) {
            console.log('Intercepting file upload form');
            form.setAttribute('data-upload-intercepted', 'true');
            interceptFileUploadForm(form);
          }
        });
      }
      
      function interceptFileUploadForm(form) {
        // Find the submit button
        const submitButton = form.querySelector('input[type="submit"], button[type="submit"]');
        if (!submitButton) return;
        
        // Store original AJAX settings if they exist
        const originalAjax = submitButton.hasAttribute('data-drupal-selector') ? 
                           Drupal.ajax.instances : null;
        
        // Don't prevent the normal form submission, just add our callback
        submitButton.addEventListener('click', function(e) {
          
          // Get the title for confirmation
          const titleField = form.querySelector('[name*="title"], [name*="name"]');
          const fileTitle = titleField ? titleField.value : 'Unknown File';
          
          // Get group ID from URL/query/top window context
          const groupId = getGroupIdFromUrl();
          
          
          // Wait for form submission to complete, then show confirmation
          setTimeout(() => {
            // Proceed regardless of dialog presence to ensure reload happens.
            console.log('File upload submit detected; showing inline confirmation and closing dialog');

            // Build inline confirmation inside the modal instead of a browser alert.
            const ts = Date.now();
            const targetUrl = buildOverviewRefreshUrl(groupId, ts);
            const dialogContent = form.closest('.ui-dialog-content');

            if (dialogContent && window.jQuery) {
              const $dialog = window.jQuery(dialogContent);
              const $msg = window.jQuery('<div class="upload-success-message" style="margin-bottom:12px;padding:10px;border:1px solid #cfe8d3;background:#e9f6ec;color:#21623a;font-weight:600;">' + Drupal.t('File "@title" uploaded successfully.', {'@title': fileTitle}) + '</div>');
              // Prepend message to dialog body
              $dialog.prepend($msg);
              // When dialog closes, force a refresh.
              $dialog.one('dialogclose', function () {
                forceRefresh(targetUrl);
              });
              // Also refresh when tab regains visibility after dialog closes.
              let visibilityHandled = false;
              const onVisible = () => {
                if (visibilityHandled) return;
                visibilityHandled = true;
                forceRefresh(targetUrl);
                document.removeEventListener('visibilitychange', onVisible, true);
              };
              document.addEventListener('visibilitychange', onVisible, true);
              // Close the dialog shortly after showing the confirmation.
              setTimeout(() => {
                try {
                  $dialog.dialog('close');
                } catch (e) {
                  forceRefresh(targetUrl);
                }
              }, 600);
            } else {
              // Fallback to top-level navigation if dialog context unavailable.
              forceRefresh(targetUrl);
              setTimeout(() => forceRefresh(targetUrl), 120);
            }
            // Final safety: force a reload even if dialog events never fire.
            setTimeout(() => forceRefresh(targetUrl), 2000);
          }, 1000); // Give form time to process
        });
      }
      
      function getGroupIdFromUrl() {
        const tryExtractGroupId = (urlLike) => {
          if (!urlLike) {
            return null;
          }

          try {
            const url = new URL(urlLike, window.location.origin);

            // Priority 1: query param (?group=123).
            const queryGroup = url.searchParams.get('group');
            if (queryGroup) {
              return queryGroup;
            }

            // Priority 2: path segment (/group/123/...).
            const pathParts = url.pathname.split('/');
            const groupIndex = pathParts.indexOf('group');
            if (groupIndex >= 0 && pathParts[groupIndex + 1]) {
              return pathParts[groupIndex + 1];
            }
          } catch (e) {
            return null;
          }

          return null;
        };

        return (
          tryExtractGroupId(window.location.href) ||
          tryExtractGroupId(document.referrer) ||
          tryExtractGroupId(window.top && window.top.location ? window.top.location.href : null)
        );
      }

      function buildOverviewRefreshUrl(groupId, timestamp) {
        if (groupId) {
          return '/group/' + groupId + '/overview?refresh=' + timestamp;
        }

        try {
          if (window.top && window.top.location) {
            const topUrl = new URL(window.top.location.href);
            topUrl.searchParams.set('refresh', timestamp.toString());
            return topUrl.toString();
          }
        } catch (e) {
          // Ignore cross-window issues and fall back.
        }

        const fallback = new URL(window.location.href);
        fallback.searchParams.set('refresh', timestamp.toString());
        return fallback.toString();
      }
    }
  };

})(Drupal);
