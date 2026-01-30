/* View block navigation custom js for alert */
(function ($, Drupal, drupalSettings) {
  'use strict';

  Drupal.behaviors.viewBlockNavigation = {
    attach: function (context, settings) {
      var $viewBlock = $('.view-id-YOUR_VIEW_ID', context).once('view-block-nav');
      
      if ($viewBlock.length === 0) return;
      
      var originalContent = null;
      var $viewContent = $viewBlock.find('.view-content');

      // Intercept clicks on node title links
      $viewBlock.on('click', '.views-field-title a, .node__title a, .usa-link', function (e) {
        e.preventDefault();
        var nodeUrl = $(this).attr('href');
        
        // Store original content first time
        if (!originalContent) {
          originalContent = $viewContent.html();
        }

        // Show USWDS 3.0 loading state
        $viewContent.html(
          '<div class="usa-alert usa-alert--info usa-alert--slim loading-node" role="status">' +
            '<div class="usa-alert__body">' +
              '<div class="display-flex flex-align-center">' +
                '<svg class="usa-icon usa-icon--size-3 text-primary margin-right-1 loading-spinner" aria-hidden="true" focusable="false" role="img">' +
                  '<use xlink:href="/libraries/uswds/dist/img/sprite.svg#autorenew"></use>' +
                '</svg>' +
                '<p class="usa-alert__text margin-0">Loading content...</p>' +
              '</div>' +
            '</div>' +
          '</div>'
        );

        // Load the full node page
        $.ajax({
          url: nodeUrl,
          method: 'GET',
          success: function (response) {
            // Extract the main node content from the response
            var $response = $(response);
            var $nodeContent = $response.find('.node--full, article.node, .node, main .usa-prose').first();
            
            if ($nodeContent.length) {
              // Create USWDS 3.0 styled back button
              var backButton = 
                '<div class="view-block-back margin-bottom-3">' +
                  '<button class="usa-button usa-button--outline back-to-view" type="button">' +
                    '<svg class="usa-icon" aria-hidden="true" focusable="false" role="img">' +
                      '<use xlink:href="/libraries/uswds/dist/img/sprite.svg#arrow_back"></use>' +
                    '</svg>' +
                    'Back to list' +
                  '</button>' +
                '</div>';
              
              // Inject back button and node content with USWDS 3.0 grid
              $viewContent.html(
                '<div class="grid-row">' +
                  '<div class="grid-col-12">' +
                    backButton +
                    '<div class="view-block-node-wrapper usa-prose"></div>' +
                  '</div>' +
                '</div>'
              );
              
              $viewContent.find('.view-block-node-wrapper').html($nodeContent);
              
              // Scroll to top of block smoothly
              $viewBlock[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
              
              // Re-attach Drupal behaviors to new content
              Drupal.attachBehaviors($viewContent[0], drupalSettings);
              
              // Announce to screen readers
              announceToScreenReader('Content loaded successfully');
              
            } else {
              showErrorMessage($viewContent, 'Could not load content.');
            }
          },
          error: function (xhr, status, error) {
            showErrorMessage($viewContent, 'Error loading content. Please try again.');
            console.error('AJAX Error:', status, error);
          }
        });
      });

      // Handle back button clicks
      $viewBlock.on('click', '.back-to-view', function (e) {
        e.preventDefault();
        
        if (originalContent) {
          // Fade out current content
          $viewContent.css('opacity', '0.5');
          
          setTimeout(function() {
            $viewContent.html(originalContent);
            $viewContent.css('opacity', '1');
            
            // Scroll back to top of block
            $viewBlock[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Re-attach behaviors to restored content
            Drupal.attachBehaviors($viewContent[0], drupalSettings);
            
            // Announce to screen readers
            announceToScreenReader('Returned to list view');
          }, 200);
        }
      });

      // Helper function to show error messages with USWDS 3.0 alert
      function showErrorMessage($container, message) {
        $container.html(
          '<div class="usa-alert usa-alert--error" role="alert">' +
            '<div class="usa-alert__body">' +
              '<h4 class="usa-alert__heading">Error</h4>' +
              '<p class="usa-alert__text">' + message + '</p>' +
              '<button class="usa-button usa-button--secondary back-to-view margin-top-2" type="button">' +
                '<svg class="usa-icon" aria-hidden="true" focusable="false" role="img">' +
                  '<use xlink:href="/libraries/uswds/dist/img/sprite.svg#arrow_back"></use>' +
                '</svg>' +
                'Back to list' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }

      // Helper function for screen reader announcements
      function announceToScreenReader(message) {
        var $announcement = $('<div>', {
          'class': 'usa-sr-only',
          'role': 'status',
          'aria-live': 'polite',
          'aria-atomic': 'true',
          'text': message
        });
        
        $('body').append($announcement);
        
        setTimeout(function() {
          $announcement.remove();
        }, 1000);
      }
    }
  };

})(jQuery, Drupal, drupalSettings);
/* end custom js for views block navigation for alert view */
